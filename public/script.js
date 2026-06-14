// Dados da equipe. Troque os placeholders antes de publicar.
const JAMBU_SITE_CONFIG = {
    raffleName: 'Rifa Jambu Racing',
    prizeName: 'INSERIR PREMIO AQUI',
    pixKey: 'INSERIR_CHAVE_PIX_AQUI',
    whatsappNumber: 'INSERIR_NUMERO_WHATSAPP_AQUI',
    whatsappDisplay: 'INSERIR TELEFONE AQUI'
};

// Firebase Integration
class FirebaseManager {
    constructor() {
        try {
            this.db = firebase.firestore();
            this.storage = firebase.storage();
            console.log('Firebase inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar Firebase:', error);
        }
    }

    // Buscar todos os números da rifa
    async getRaffleNumbers() {
        try {
            const snapshot = await this.db.collection('raffleNumbers').get();
            const numbers = {};
            snapshot.forEach(doc => {
                numbers[doc.id] = doc.data();
            });
            console.log('Números carregados:', Object.keys(numbers).length);
            return numbers;
        } catch (error) {
            console.error('Erro ao buscar números:', error);
            throw error;
        }
    }

    // Verificar se número está disponível
    async checkNumberAvailability(number) {
        try {
            const doc = await this.db.collection('raffleNumbers').doc(number.toString()).get();
            if (!doc.exists) return true; // Se não existe, está disponível
            
            const data = doc.data();
            return data.status === 'available';
        } catch (error) {
            console.error('Erro ao verificar número:', error);
            return false;
        }
    }

    // Tentar reservar número com verificação
    async tryReserveNumber(number, buyerInfo) {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            
            // Usar transação para garantir atomicidade
            const result = await this.db.runTransaction(async (transaction) => {
                const doc = await transaction.get(numberRef);
                
                if (!doc.exists) {
                    // Criar número se não existir
                    transaction.set(numberRef, {
                        number: parseInt(number),
                        status: 'reserved',
                        buyerInfo: buyerInfo,
                        reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        reservedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    return { success: true, action: 'created' };
                }
                
                const data = doc.data();
                if (data.status === 'available') {
                    // Reservar número disponível
                    transaction.update(numberRef, {
                        status: 'reserved',
                        buyerInfo: buyerInfo,
                        reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        reservedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
                    });
                    return { success: true, action: 'reserved' };
                } else {
                    return { success: false, reason: `Número ${number} já está ${data.status}` };
                }
            });
            
            return result;
        } catch (error) {
            console.error('Erro na transação de reserva:', error);
            return { success: false, reason: 'Erro de servidor' };
        }
    }

    // Criar nova transação
    async createTransaction(transactionData) {
        try {
            const transactionRef = await this.db.collection('transactions').add({
                ...transactionData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'pending'
            });
            return transactionRef.id;
        } catch (error) {
            console.error('Erro ao criar transação:', error);
            throw error;
        }
    }

    // Upload de comprovante
    async uploadPaymentProof(file, transactionId) {
        try {
            const filePath = `payment-proofs/${transactionId}/${file.name}`;
            const storageRef = this.storage.ref(filePath);
            const snapshot = await storageRef.put(file);
            const downloadURL = await snapshot.ref.getDownloadURL();
            return downloadURL;
        } catch (error) {
            console.error('Erro ao fazer upload do comprovante:', error);
            throw error;
        }
    }

    // Atualizar transação com comprovante
    async updateTransactionWithProof(transactionId, proofURL, buyerInfo) {
        try {
            await this.db.collection('transactions').doc(transactionId).update({
                paymentProof: proofURL,
                buyerInfo: buyerInfo,
                proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Erro ao atualizar transação:', error);
            throw error;
        }
    }

    // Escutar mudanças nos números em tempo real
    listenToNumbersUpdates(callback) {
        return this.db.collection('raffleNumbers').onSnapshot(snapshot => {
            const numbers = {};
            snapshot.forEach(doc => {
                numbers[doc.id] = doc.data();
            });
            callback(numbers);
        }, error => {
            console.error('Erro no listener em tempo real:', error);
        });
    }

    // Adicionar número vendido manualmente
    async addManualSale(number, buyerName, buyerPhone = null) {
        try {
            const buyerInfo = {
                firstName: buyerName.split(' ')[0],
                lastName: buyerName.split(' ').slice(1).join(' ') || '',
                phone: buyerPhone || 'Não informado',
                manualEntry: true
            };

            await this.db.collection('raffleNumbers').doc(number.toString()).update({
                status: 'sold',
                buyerInfo: buyerInfo,
                soldAt: firebase.firestore.FieldValue.serverTimestamp(),
                reservedUntil: null,
                manualEntry: true
            });

            return true;
        } catch (error) {
            // Se o documento não existir, criar
            if (error.code === 'not-found') {
                await this.db.collection('raffleNumbers').doc(number.toString()).set({
                    number: parseInt(number),
                    status: 'sold',
                    buyerInfo: {
                        firstName: buyerName.split(' ')[0],
                        lastName: buyerName.split(' ').slice(1).join(' ') || '',
                        phone: buyerPhone || 'Não informado',
                        manualEntry: true
                    },
                    soldAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    manualEntry: true
                });
                return true;
            }
            console.error('Erro ao adicionar venda manual:', error);
            throw error;
        }
    }
}

// Raffle Management System
class RaffleManager {
    constructor() {
        this.numbers = new Map();
        this.selectedNumbers = new Set();
        this.pricePerNumber = 15;
        this.currentOrder = null;
        this.confirmationData = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('Iniciando RaffleManager...');
            
            // Inicializar Firebase primeiro
            this.firebase = new FirebaseManager();
            
            // Gerar grade visual imediatamente
            this.generateNumbersGrid();
            this.initializeEventListeners();
            
            // Depois carregar dados do Firebase
            await this.loadNumbersFromFirebase();
            
            // Configurar listener em tempo real
            this.setupRealTimeListener();
            
            this.updateDisplay();
            console.log('RaffleManager inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar RaffleManager:', error);
            // Mesmo com erro, mostra a interface
            this.generateNumbersGrid();
            this.initializeEventListeners();
            this.updateDisplay();
            this.showToast('Erro ao conectar com o servidor. Recarregue a página.', 'error');
        }
    }

    async loadNumbersFromFirebase() {
        try {
            const numbersData = await this.firebase.getRaffleNumbers();
            
            // Se não houver números no Firestore, inicializar
            if (Object.keys(numbersData).length === 0) {
                console.log('Inicializando números no Firestore...');
                await this.initializeFirestoreNumbers();
            } else {
                // Carregar números existentes
                console.log('Carregando números existentes...');
                for (let i = 1; i <= 500; i++) {
                    const numberData = numbersData[i.toString()] || {
                        number: i,
                        status: 'available',
                        reservedUntil: null,
                        buyerInfo: null
                    };
                    this.numbers.set(i, numberData);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar números:', error);
            // Inicializar números localmente em caso de erro
            this.initializeLocalNumbers();
        }
    }

    async initializeFirestoreNumbers() {
        try {
            // Usar batches para escrever em lotes (máximo 500 operações por batch)
            const batch = this.firebase.db.batch();
            
            for (let i = 1; i <= 500; i++) {
                const numberRef = this.firebase.db.collection('raffleNumbers').doc(i.toString());
                const numberData = {
                    number: i,
                    status: 'available',
                    reservedUntil: null,
                    buyerInfo: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                batch.set(numberRef, numberData);
                this.numbers.set(i, numberData);
            }
            
            await batch.commit();
            console.log('Números inicializados no Firestore');
        } catch (error) {
            console.error('Erro ao inicializar Firestore:', error);
            this.initializeLocalNumbers();
        }
    }

    initializeLocalNumbers() {
        console.log('Inicializando números localmente...');
        for (let i = 1; i <= 500; i++) {
            this.numbers.set(i, {
                number: i,
                status: 'available',
                reservedUntil: null,
                buyerInfo: null
            });
        }
    }

    setupRealTimeListener() {
        if (!this.firebase) return;
        
        this.firebase.listenToNumbersUpdates((numbers) => {
            console.log('Atualização em tempo real recebida');
            Object.keys(numbers).forEach(numberStr => {
                const number = parseInt(numberStr);
                this.numbers.set(number, numbers[numberStr]);
            });
            this.updateDisplay();
        });
    }

    initializeEventListeners() {
        // Quick action buttons
        document.getElementById('surprise-btn').addEventListener('click', () => {
            this.selectRandomNumbers(1);
        });
        
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearSelection();
        });
        
        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closePaymentModal();
        });
        
        // Click outside modal to close
        document.getElementById('payment-modal').addEventListener('click', (e) => {
            if (e.target.id === 'payment-modal') {
                this.closePaymentModal();
            }
        });
    }

    generateNumbersGrid() {
        const grid = document.getElementById('numbers-grid');
        if (!grid) {
            console.error('Elemento numbers-grid não encontrado!');
            return;
        }
        
        grid.innerHTML = '';
        
        for (let i = 1; i <= 500; i++) {
            const button = document.createElement('button');
            button.className = 'number-btn available';
            button.textContent = i;
            button.addEventListener('click', () => this.toggleNumber(i));
            grid.appendChild(button);
        }
        console.log('Grade de números gerada com 500 números');
    }

    toggleNumber(number) {
        // Se não temos dados do Firebase ainda, usar dados locais
        if (this.numbers.size === 0) {
            if (this.selectedNumbers.has(number)) {
                this.selectedNumbers.delete(number);
            } else {
                this.selectedNumbers.add(number);
            }
            this.updateDisplay();
            return;
        }

        const numberData = this.numbers.get(number);
        if (!numberData || (numberData.status !== 'available' && numberData.status !== 'selected')) {
            return;
        }

        if (this.selectedNumbers.has(number)) {
            this.selectedNumbers.delete(number);
            numberData.status = 'available';
        } else {
            this.selectedNumbers.add(number);
            numberData.status = 'selected';
        }
        
        this.updateDisplay();
    }

    selectRandomNumbers(count) {
        let available = Array.from(this.numbers.values())
            .filter(n => n.status === 'available')
            .map(n => n.number);
        
        if (available.length === 0) {
            available = Array.from({length: 500}, (_, i) => i + 1)
                .filter(n => !this.selectedNumbers.has(n));
        }
        
        if (available.length < count) {
            this.showToast('Não há números suficientes disponíveis', 'error');
            return;
        }
        
        const randomNumbers = available
            .sort(() => Math.random() - 0.5)
            .slice(0, count);
        
        randomNumbers.forEach(number => {
            this.selectedNumbers.add(number);
            if (this.numbers.has(number)) {
                this.numbers.get(number).status = 'selected';
            }
        });
        
        this.updateDisplay();
        this.showToast(`${count} números selecionados aleatoriamente!`, 'success');
    }

    clearSelection() {
        this.selectedNumbers.forEach(number => {
            if (this.numbers.has(number)) {
                this.numbers.get(number).status = 'available';
            }
        });
        
        this.selectedNumbers.clear();
        this.updateDisplay();
        this.showToast('Seleção limpa!', 'success');
    }

    updateDisplay() {
        this.updateStats();
        this.updateNumbersGrid();
        this.updateCart();
    }

    updateStats() {
        if (this.numbers.size > 0) {
            const available = Array.from(this.numbers.values()).filter(n => n.status === 'available').length;
            const selected = this.selectedNumbers.size;
            const reserved = Array.from(this.numbers.values()).filter(n => n.status === 'reserved').length;
            const sold = Array.from(this.numbers.values()).filter(n => n.status === 'sold').length;
            
            document.getElementById('available-count').textContent = available;
            document.getElementById('selected-count').textContent = selected;
            document.getElementById('reserved-count').textContent = reserved;
            document.getElementById('sold-count').textContent = sold;
        } else {
            // Valores padrão até carregar do Firebase
            const selected = this.selectedNumbers.size;
            document.getElementById('available-count').textContent = 500 - selected;
            document.getElementById('selected-count').textContent = selected;
            document.getElementById('reserved-count').textContent = 0;
            document.getElementById('sold-count').textContent = 0;
        }
    }

    updateNumbersGrid() {
        const buttons = document.querySelectorAll('.number-btn');
        
        buttons.forEach(button => {
            const number = parseInt(button.textContent);
            
            // Reset classes
            button.className = 'number-btn';
            
            // Verificar se temos dados do número
            if (this.numbers.has(number)) {
                const numberData = this.numbers.get(number);
                button.classList.add(numberData.status);
                button.disabled = numberData.status === 'reserved' || numberData.status === 'sold';
                
                // Remove existing timer badge
                const existingBadge = button.querySelector('.timer-badge');
                if (existingBadge) {
                    existingBadge.remove();
                }
                
                // Add timer for reserved numbers
                if (numberData.status === 'reserved' && numberData.reservedUntil) {
                    const reservedUntil = new Date(numberData.reservedUntil.seconds * 1000);
                    const timeLeft = this.getTimeLeft(reservedUntil);
                    if (timeLeft > 0) {
                        const badge = document.createElement('div');
                        badge.className = 'timer-badge';
                        badge.textContent = this.formatTime(timeLeft);
                        button.appendChild(badge);
                    }
                }

                // Tooltip para números vendidos
                if (numberData.status === 'sold' && numberData.buyerInfo) {
                    button.title = `Vendido para: ${numberData.buyerInfo.firstName} ${numberData.buyerInfo.lastName}`;
                }
            } else {
                // Se não temos dados do Firebase, usar seleção local
                if (this.selectedNumbers.has(number)) {
                    button.classList.add('selected');
                } else {
                    button.classList.add('available');
                }
            }
        });
    }

    updateCart() {
        const cartCard = document.getElementById('cart-card');
        const selectedCount = this.selectedNumbers.size;
        const totalValue = selectedCount * this.pricePerNumber;
        
        if (selectedCount === 0) {
            cartCard.innerHTML = `
                <div class="cart-empty">
                    <div class="cart-icon">🛒</div>
                    <p style="color: #d1d5db;">Selecione os números para participar da rifa</p>
                    <p style="color: #9ca3af; font-size: 0.875rem; margin-top: 8px;">Cada número custa R$ 15,00</p>
                </div>
            `;
            return;
        }
        
        const selectedArray = Array.from(this.selectedNumbers).sort((a, b) => a - b);
        const numbersHtml = selectedArray.map(num => 
            `<span class="number-badge">${num}</span>`
        ).join('');
        
        cartCard.innerHTML = `
            <div class="cart-header">
                <span style="font-size: 1.25rem;">🛒</span>
                <h3 class="cart-title">Resumo do Pedido</h3>
            </div>
            
            <div class="selected-numbers">
                <h3>Números Selecionados:</h3>
                <div class="numbers-list">${numbersHtml}</div>
            </div>
            
            <div class="cart-summary">
                <div class="summary-row">
                    <span>Quantidade:</span>
                    <span>${selectedCount} números</span>
                </div>
                <div class="summary-row">
                    <span>Valor unitário:</span>
                    <span>R$ 15,00</span>
                </div>
                <div class="summary-total">
                    <span>Total:</span>
                    <span class="total-amount">R$ ${totalValue.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="cart-action">
                <button class="btn btn-primary btn-full" onclick="raffleManager.openPaymentModal()">
                    💳 Finalizar Compra
                </button>
            </div>
            
            <div class="cart-info">
                <p>• Você terá 24 horas para enviar o comprovante</p>
                <p>• Os números ficarão reservados durante este período</p>
                <p>• Após a confirmação, os números serão confirmados</p>
            </div>
        `;
    }

    openPaymentModal() {
        if (this.selectedNumbers.size === 0) return;
        this.showPaymentFormModal();
    }

    showPaymentFormModal() {
        const modal = document.getElementById('payment-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        
        modalTitle.textContent = 'Finalizar Compra';
        
        const selectedArray = Array.from(this.selectedNumbers).sort((a, b) => a - b);
        const numbersHtml = selectedArray.map(num => 
            `<span class="number-badge">${num}</span>`
        ).join('');
        
        const totalValue = selectedArray.length * this.pricePerNumber;
        
        modalContent.innerHTML = `
            <div class="order-summary glass-effect">
                <h3 style="font-weight: 600; margin-bottom: 12px;">Resumo do Pedido</h3>
                <div class="summary-row">
                    <span>Números selecionados:</span>
                    <span>${selectedArray.length}</span>
                </div>
                <div class="summary-row">
                    <span>Valor total:</span>
                    <span style="color: #10b981; font-weight: bold;">R$ ${totalValue.toFixed(2)}</span>
                </div>
                <div style="margin-top: 12px;">
                    <div class="numbers-list">${numbersHtml}</div>
                </div>
            </div>

            <form id="payment-form" class="payment-form">
                <div class="form-section glass-effect">
                    <h3 style="font-weight: 600; margin-bottom: 12px;">Seus Dados</h3>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="firstName">Nome *</label>
                            <input type="text" id="firstName" required>
                        </div>
                        <div class="form-group">
                            <label for="lastName">Sobrenome *</label>
                            <input type="text" id="lastName" required>
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email">
                        </div>
                        <div class="form-group">
                            <label for="phone">Telefone *</label>
                            <input type="tel" id="phone" required>
                        </div>
                    </div>
                </div>

                <div class="form-section glass-effect">
                    <h3 style="font-weight: 600; margin-bottom: 12px;">Pagamento PIX</h3>
                    
                    <div class="pix-info">
                        <div class="qr-code">
                            <div class="qr-placeholder">INSERIR QR CODE PIX AQUI</div>
                        </div>
                        
                        <div class="pix-details">
                            <div class="pix-field">
                                <label class="pix-label">Chave PIX:</label>
                                <div class="pix-input-group">
                                    <div class="pix-value">${JAMBU_SITE_CONFIG.pixKey}</div>
                                    <button type="button" class="copy-btn" onclick="raffleManager.copyToClipboard('${JAMBU_SITE_CONFIG.pixKey}', 'Chave PIX')">
                                        📋
                                    </button>
                                </div>
                            </div>
                            <div class="pix-field">
                                <label class="pix-label">Valor:</label>
                                <div class="pix-input-group">
                                    <div class="pix-value">R$ ${totalValue.toFixed(2)}</div>
                                    <button type="button" class="copy-btn" onclick="raffleManager.copyToClipboard('${totalValue.toFixed(2)}', 'Valor')">
                                        📋
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-section glass-effect">
                    <h3 style="font-weight: 600; margin-bottom: 12px;">Envio do Comprovante</h3>
                    
                    <div class="proof-options">
                        <label class="option-item">
                            <input type="radio" name="proofMethod" value="whatsapp" checked>
                            <span>Enviar comprovante via WhatsApp</span>
                        </label>
                        <label class="option-item">
                            <input type="radio" name="proofMethod" value="upload">
                            <span>Anexar comprovante no site</span>
                        </label>
                    </div>

                    <div id="upload-section" style="display: none; margin-top: 12px;">
                        <label for="proofFile" class="file-label">
                            <span>📎 Anexar comprovante (imagem ou PDF)</span>
                            <input type="file" id="proofFile" accept="image/*,.pdf" style="display: none;">
                        </label>
                        <div id="file-name" style="font-size: 0.875rem; color: #9ca3af; margin-top: 4px;"></div>
                    </div>

                    <div id="whatsapp-section" style="margin-top: 12px;">
                        <p style="font-size: 0.875rem; color: #d1d5db;">
                            📱 Envie o comprovante para: <strong>${JAMBU_SITE_CONFIG.whatsappDisplay}</strong>
                        </p>
                        <div class="whatsapp-message glass-effect" style="margin-top: 8px; padding: 12px;">
                            <p style="font-size: 0.875rem; margin-bottom: 8px;">
                                <strong>Enviar mensagem diretamente:</strong>
                            </p>
                            <p style="font-size: 0.75rem; color: #9ca3af;" id="suggested-message">
                                Olá! Realizei o pagamento da ${JAMBU_SITE_CONFIG.raffleName}. Números: ${selectedArray.join(', ')}. Valor: R$ ${totalValue.toFixed(2)}
                            </p>
                            <button type="button" class="btn btn-success" onclick="raffleManager.openWhatsApp()" style="margin-top: 8px; width: 100%;">
                                📱 Abrir WhatsApp
                            </button>
                        </div>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-success btn-full">
                        ✅ Finalizar Pedido
                    </button>
                    <button type="button" class="btn btn-outline btn-full" onclick="raffleManager.closePaymentModal()">
                        ← Cancelar
                    </button>
                </div>

                <div class="payment-info">
                    <p>• O número será reservado por 24h após o envio do comprovante</p>
                    <p>• Após a verificação manual, você receberá a confirmação</p>
                    <p>• Em caso de problemas, entre em contato conosco</p>
                </div>
            </form>
        `;

        this.setupFormEvents();
        modal.classList.add('active');
    }

    // Abrir WhatsApp com mensagem pré-preenchida
    openWhatsApp() {
        const firstName = document.getElementById('firstName')?.value || '';
        const lastName = document.getElementById('lastName')?.value || '';
        const selectedArray = Array.from(this.selectedNumbers).sort((a, b) => a - b);
        const totalValue = selectedArray.length * this.pricePerNumber;
        
        let message = `Olá! Realizei o pagamento da ${JAMBU_SITE_CONFIG.raffleName}.\n\n`;
        
        if (firstName || lastName) {
            message += `*Nome:* ${firstName} ${lastName}\n`;
        }
        
        message += `*Números:* ${selectedArray.join(', ')}\n`;
        message += `*Valor:* R$ ${totalValue.toFixed(2)}\n\n`;
        message += `Anexo: comprovante de pagamento`;
        
        // Codificar a mensagem para URL
        const encodedMessage = encodeURIComponent(message);
        
        // Número no formato internacional (sem espaços, parênteses, etc.)
        const phoneNumber = JAMBU_SITE_CONFIG.whatsappNumber;
        
        // Criar URL do WhatsApp
        const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        
        // Abrir em nova janela
        window.open(whatsappURL, '_blank');
        
        this.showToast('Abrindo WhatsApp...', 'success');
    }

    setupFormEvents() {
        const form = document.getElementById('payment-form');
        const proofMethodRadios = document.querySelectorAll('input[name="proofMethod"]');
        const uploadSection = document.getElementById('upload-section');
        const whatsappSection = document.getElementById('whatsapp-section');
        const fileInput = document.getElementById('proofFile');
        const fileName = document.getElementById('file-name');

        proofMethodRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'upload') {
                    uploadSection.style.display = 'block';
                    whatsappSection.style.display = 'none';
                } else {
                    uploadSection.style.display = 'none';
                    whatsappSection.style.display = 'block';
                }
            });
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                fileName.textContent = `Arquivo selecionado: ${e.target.files[0].name}`;
            } else {
                fileName.textContent = '';
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPayment();
        });
    }

    async submitPayment() {
        const buyerInfo = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value
        };

        const proofMethod = document.querySelector('input[name="proofMethod"]:checked').value;
        const selectedNumbers = Array.from(this.selectedNumbers);
        const totalValue = selectedNumbers.length * this.pricePerNumber;

        if (!buyerInfo.firstName || !buyerInfo.lastName || !buyerInfo.phone) {
            this.showToast('Preencha todos os campos obrigatórios', 'error');
            return;
        }

        if (proofMethod === 'upload' && !document.getElementById('proofFile').files[0]) {
            this.showToast('Anexe o comprovante de pagamento', 'error');
            return;
        }

        try {
            this.showToast('Processando seu pedido...', 'success');

            // VERIFICAÇÃO DE DISPONIBILIDADE ANTES DE RESERVAR
            let allAvailable = true;
            const availabilityResults = [];
            
            for (const number of selectedNumbers) {
                const isAvailable = await this.firebase.checkNumberAvailability(number);
                availabilityResults.push({ number, available: isAvailable });
                if (!isAvailable) allAvailable = false;
            }

            if (!allAvailable) {
                const unavailableNumbers = availabilityResults
                    .filter(result => !result.available)
                    .map(result => result.number);
                
                this.showToast(`Números ${unavailableNumbers.join(', ')} não estão mais disponíveis. Atualize a página.`, 'error');
                return;
            }

            // TENTAR RESERVAR OS NÚMEROS
            const reservationResults = [];
            for (const number of selectedNumbers) {
                const result = await this.firebase.tryReserveNumber(number, buyerInfo);
                reservationResults.push({ number, success: result.success, reason: result.reason });
                
                if (!result.success) {
                    this.showToast(`Erro ao reservar número ${number}: ${result.reason}`, 'error');
                    // Reverter reservas que deram certo
                    for (const reserved of reservationResults) {
                        if (reserved.success) {
                            // Aqui você poderia implementar um método para liberar a reserva
                        }
                    }
                    return;
                }
            }

            // CRIAR TRANSAÇÃO
            const transactionData = {
                numbers: selectedNumbers,
                buyerInfo: buyerInfo,
                totalValue: totalValue,
                proofMethod: proofMethod,
                status: 'pending'
            };

            const transactionId = await this.firebase.createTransaction(transactionData);

            // UPLOAD DE COMPROVANTE (se aplicável)
            if (proofMethod === 'upload') {
                const file = document.getElementById('proofFile').files[0];
                const proofURL = await this.firebase.uploadPaymentProof(file, transactionId);
                await this.firebase.updateTransactionWithProof(transactionId, proofURL, buyerInfo);
            }

            // MOSTRAR CONFIRMAÇÃO
            this.showPaymentConfirmation(transactionId, buyerInfo, selectedNumbers, proofMethod);

            // LIMPAR SELEÇÃO
            this.selectedNumbers.clear();
            this.updateDisplay();

        } catch (error) {
            
            
            if (error.code === 'permission-denied') {
                this.showToast('Erro de permissão. Entre em contato com o administrador.', 'error');
            } else {
             
            }
        }
    }

    showPaymentConfirmation(transactionId, buyerInfo, numbers, proofMethod) {
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');

        modalTitle.textContent = 'Pedido Confirmado!';

        const numbersHtml = numbers.map(num => 
            `<span class="number-badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: rgba(16, 185, 129, 0.3);">${num}</span>`
        ).join('');

        let proofInstructions = '';
        if (proofMethod === 'whatsapp') {
            proofInstructions = `
                <div class="proof-instructions glass-effect">
                    <h4 style="font-weight: 600; margin-bottom: 8px;">📱 Envie seu comprovante via WhatsApp</h4>
                    <p style="font-size: 0.875rem; color: #d1d5db;">
                        Envie para: <strong>${JAMBU_SITE_CONFIG.whatsappDisplay}</strong>
                    </p>
                    <button type="button" class="btn btn-success" onclick="raffleManager.openWhatsAppConfirmation()" style="margin-top: 8px; width: 100%;">
                        📱 Abrir WhatsApp Agora
                    </button>
                </div>
            `;
        }

        modalContent.innerHTML = `
            <div class="success-content">
                <div class="success-icon" style="font-size: 4rem; margin-bottom: 16px;">✅</div>
                <h3 class="success-title">Pedido Recebido!</h3>
                <p class="success-message">Seus números foram reservados por 24h</p>
                
                <div class="order-summary glass-effect">
                    <div class="summary-row">
                        <span>Números reservados:</span>
                        <span>${numbers.length}</span>
                    </div>
                    <div class="summary-row">
                        <span>Valor:</span>
                        <span style="color: #10b981;">R$ ${(numbers.length * this.pricePerNumber).toFixed(2)}</span>
                    </div>
                    <div class="summary-row">
                        <span>ID do pedido:</span>
                        <span style="font-family: monospace; font-size: 0.875rem;">${transactionId}</span>
                    </div>
                    <div style="margin-top: 12px;">
                        <p style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 8px;">Seus números:</p>
                        <div class="numbers-list">${numbersHtml}</div>
                    </div>
                </div>

                ${proofInstructions}

                <div class="next-steps glass-effect">
                    <h4 style="font-weight: 600; margin-bottom: 8px;">Próximos passos:</h4>
                    <p style="font-size: 0.875rem; color: #d1d5db;">
                        1. Aguarde a confirmação do pagamento<br>
                        2. Você receberá uma mensagem de confirmação<br>
                        3. Os números serão marcados como vendidos
                    </p>
                </div>
                
                <button class="btn btn-primary btn-full" onclick="raffleManager.closePaymentModal()">
                    Continuar
                </button>
            </div>
        `;

        // Guardar informações para o WhatsApp de confirmação
        this.confirmationData = { buyerInfo, numbers, totalValue };
    }

    // WhatsApp para confirmação após pedido
    openWhatsAppConfirmation() {
        if (!this.confirmationData) return;
        
        const { buyerInfo, numbers, totalValue } = this.confirmationData;
        
        let message = `*CONFIRMAÇÃO DE PAGAMENTO - ${JAMBU_SITE_CONFIG.raffleName.toUpperCase()}*\n\n`;
        message += `*Nome:* ${buyerInfo.firstName} ${buyerInfo.lastName}\n`;
        message += `*Telefone:* ${buyerInfo.phone}\n`;
        message += `*Números:* ${numbers.join(', ')}\n`;
        message += `*Valor:* R$ ${totalValue.toFixed(2)}\n`;
        message += `*ID do Pedido:* ${'local-' + Date.now()}\n\n`;
        message += `Segue em anexo o comprovante de pagamento.`;
        
        const encodedMessage = encodeURIComponent(message);
        const phoneNumber = JAMBU_SITE_CONFIG.whatsappNumber;
        const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        
        window.open(whatsappURL, '_blank');
    }

    closePaymentModal() {
        const modal = document.getElementById('payment-modal');
        modal.classList.remove('active');
        this.currentOrder = null;
        this.confirmationData = null;
    }

    copyToClipboard(text, label) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast(`${label} copiado!`, 'success');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast(`${label} copiado!`, 'success');
        });
    }

    getTimeLeft(endTime) {
        const now = new Date();
        const timeLeft = endTime.getTime() - now.getTime();
        return Math.max(0, Math.floor(timeLeft / 1000));
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-title">${type === 'success' ? 'Sucesso!' : 'Atenção!'}</div>
            <div class="toast-message">${message}</div>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    // Adicionar venda manual (para teste)
    async addManualSale(number, buyerName, buyerPhone = null) {
        if (!this.firebase) {
            this.showToast('Firebase não disponível', 'error');
            return;
        }

        try {
            await this.firebase.addManualSale(number, buyerName, buyerPhone);
            this.showToast(`Número ${number} marcado como vendido para ${buyerName}`, 'success');
        } catch (error) {
            console.error('Erro ao adicionar venda manual:', error);
            this.showToast('Erro ao adicionar venda manual', 'error');
        }
    }
}

// Initialize the raffle manager when page loads
let raffleManager;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, inicializando RaffleManager...');
    raffleManager = new RaffleManager();
    
    // Update timers every second
    setInterval(() => {
        if (raffleManager) {
            raffleManager.updateDisplay();
        }
    }, 1000);
});

// Prevent context menu on number buttons
document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('number-btn')) {
        e.preventDefault();
    }
});

// Função global para teste rápido de vendas manuais
window.addSale = function(number, name, phone = null) {
    if (raffleManager) {
        raffleManager.addManualSale(number, name, phone);
    } else {
        console.error('RaffleManager não inicializado');
    }
};
