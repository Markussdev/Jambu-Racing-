// Dados da equipe. Troque os placeholders antes de publicar.
const JAMBU_SITE_CONFIG = {
    raffleName: 'Rifa Jambu Racing',
    prizeName: '2 premios de R$ 250,00',
    totalNumbers: 1000,
    pricePerNumber: 3,
    pixKey: 'equipebajanazare@gmail.com',
    whatsappNumber: '559186065036',
    whatsappDisplay: '+55 91 8606-5036'
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

    // Converter diferentes formatos de data (Timestamp, {seconds}, Date) para Date
    toDate(value) {
        if (!value) return null;
        if (value.toDate) return value.toDate();
        if (value.seconds) return new Date(value.seconds * 1000);
        return new Date(value);
    }

    // Verificar se uma reserva online expirou (reservas manuais nunca expiram)
    isExpiredReservation(data) {
        if (!data || data.status !== 'reserved') return false;
        if (data.manualReserve) return false;
        if (!data.reservedUntil) return false;

        const reservedUntil = this.toDate(data.reservedUntil);
        return reservedUntil && reservedUntil.getTime() <= Date.now();
    }

    // Liberar uma reserva expirada (volta para disponível)
    async releaseExpiredReservation(numberRef) {
        await numberRef.update({
            status: 'available',
            buyerInfo: null,
            reservedAt: null,
            reservedUntil: null,
            releasedAt: firebase.firestore.FieldValue.serverTimestamp(),
            releaseReason: 'Reserva expirada automaticamente'
        });
    }

    // Varrer e liberar todas as reservas expiradas
    async cleanupExpiredReservations() {
        try {
            const snapshot = await this.db
                .collection('raffleNumbers')
                .where('status', '==', 'reserved')
                .get();

            const batch = this.db.batch();
            let count = 0;

            snapshot.forEach(doc => {
                if (this.isExpiredReservation(doc.data())) {
                    batch.update(doc.ref, {
                        status: 'available',
                        buyerInfo: null,
                        reservedAt: null,
                        reservedUntil: null,
                        releasedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        releaseReason: 'Reserva expirada automaticamente'
                    });
                    count++;
                }
            });

            if (count > 0) {
                await batch.commit();
                console.log(`${count} reservas expiradas liberadas`);
            }
        } catch (error) {
            console.error('Erro ao limpar reservas expiradas:', error);
        }
    }

    // Verificar se número está disponível
    async checkNumberAvailability(number) {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            const doc = await numberRef.get();
            if (!doc.exists) return true; // Se não existe, está disponível

            const data = doc.data();

            if (data.status === 'available') return true;

            // Se for uma reserva expirada, libera e considera disponível
            if (this.isExpiredReservation(data)) {
                await this.releaseExpiredReservation(numberRef);
                return true;
            }

            return false;
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
        this.totalNumbers = JAMBU_SITE_CONFIG.totalNumbers;
        this.pricePerNumber = JAMBU_SITE_CONFIG.pricePerNumber;
        this.currentOrder = null;
        this.confirmationData = null;

        // Cartelas: mostra só uma faixa de números por vez
        this.rangeSize = 200;
        this.activeRangeStart = 1;
        this.activeRangeEnd = 200;

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

            // Liberar reservas expiradas antes de carregar
            await this.firebase.cleanupExpiredReservations();

            // Depois carregar dados do Firebase
            await this.loadNumbersFromFirebase();

            // Configurar listener em tempo real
            this.setupRealTimeListener();

            // Verificar reservas expiradas periodicamente (a cada 60s)
            setInterval(() => {
                this.firebase?.cleanupExpiredReservations();
            }, 60 * 1000);
            
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
                for (let i = 1; i <= this.totalNumbers; i++) {
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
            let batch = this.firebase.db.batch();
            let operationCount = 0;
            
            for (let i = 1; i <= this.totalNumbers; i++) {
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

                operationCount++;
                if (operationCount === 500) {
                    await batch.commit();
                    batch = this.firebase.db.batch();
                    operationCount = 0;
                }
            }
            
            if (operationCount > 0) {
                await batch.commit();
            }
            console.log(`${this.totalNumbers} numeros inicializados no Firestore`);
        } catch (error) {
            console.error('Erro ao inicializar Firestore:', error);
            this.initializeLocalNumbers();
        }
    }

    initializeLocalNumbers() {
        console.log('Inicializando números localmente...');
        for (let i = 1; i <= this.totalNumbers; i++) {
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
            const removedFromSelection = [];

            Object.keys(numbers).forEach(numberStr => {
                const number = parseInt(numberStr);
                const data = numbers[numberStr];
                this.numbers.set(number, data);

                // Se o número saiu de disponível (ex.: admin confirmou/reservou),
                // remove-o da seleção do usuário
                if (this.selectedNumbers.has(number) && data.status !== 'available' && data.status !== 'selected') {
                    this.selectedNumbers.delete(number);
                    removedFromSelection.push(number);
                }
            });

            this.updateDisplay();

            if (removedFromSelection.length > 0) {
                this.showToast(
                    `Número(s) ${removedFromSelection.join(', ')} foram atualizados e removidos da sua seleção.`,
                    'error'
                );
            }
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

        // Navegação por cartelas (faixas de números)
        document.querySelectorAll('.range-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.range-tab').forEach(btn => {
                    btn.classList.remove('active');
                });

                tab.classList.add('active');

                this.activeRangeStart = parseInt(tab.dataset.start);
                this.activeRangeEnd = parseInt(tab.dataset.end);

                this.generateNumbersGrid();
                this.updateDisplay();
            });
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

        // Gera apenas a faixa (cartela) ativa
        for (let i = this.activeRangeStart; i <= this.activeRangeEnd; i++) {
            const button = document.createElement('button');
            button.className = 'number-btn available';
            button.textContent = i.toString().padStart(3, '0');
            button.dataset.number = i;
            button.addEventListener('click', () => this.toggleNumber(i));
            grid.appendChild(button);
        }
        console.log(`Grade gerada: ${this.activeRangeStart} até ${this.activeRangeEnd}`);
    }

    // Muda para a cartela que contém o número informado (e marca a aba)
    goToRangeOfNumber(number) {
        document.querySelectorAll('.range-tab').forEach(tab => {
            const start = parseInt(tab.dataset.start);
            const end = parseInt(tab.dataset.end);
            const isTarget = number >= start && number <= end;
            tab.classList.toggle('active', isTarget);
            if (isTarget) {
                this.activeRangeStart = start;
                this.activeRangeEnd = end;
            }
        });
        this.generateNumbersGrid();
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
            available = Array.from({length: this.totalNumbers}, (_, i) => i + 1)
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

        // Pula para a cartela do número sorteado para o usuário vê-lo
        this.goToRangeOfNumber(randomNumbers[0]);

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

    formatCurrency(value) {
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
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
            document.getElementById('available-count').textContent = this.totalNumbers - selected;
            document.getElementById('selected-count').textContent = selected;
            document.getElementById('reserved-count').textContent = 0;
            document.getElementById('sold-count').textContent = 0;
        }
    }

    updateNumbersGrid() {
        const buttons = document.querySelectorAll('.number-btn');
        
        buttons.forEach(button => {
            const number = parseInt(button.dataset.number);

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
                    <p style="color: #9ca3af; font-size: 0.875rem; margin-top: 8px;">Cada número custa ${this.formatCurrency(this.pricePerNumber)}</p>
                </div>
            `;
            return;
        }
        
        const selectedArray = Array.from(this.selectedNumbers).sort((a, b) => a - b);
        const numbersHtml = selectedArray.map(num => 
            `<span class="number-badge">${num.toString().padStart(3, '0')}</span>`
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
                    <span>${this.formatCurrency(this.pricePerNumber)}</span>
                </div>
                <div class="summary-total">
                    <span>Total:</span>
                    <span class="total-amount">${this.formatCurrency(totalValue)}</span>
                </div>
            </div>
            
            <div class="cart-action">
                <button class="btn btn-primary btn-full" onclick="raffleManager.openPaymentModal()">
                    💳 Finalizar Compra
                </button>
            </div>
            
            <div class="cart-info">
                <p>• Você terá 24 horas para enviar o comprovante pelo WhatsApp</p>
                <p>• Os números ficarão reservados durante este período</p>
                <p>• Após a confirmação da equipe, os números serão marcados como vendidos</p>
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
            `<span class="number-badge">${num.toString().padStart(3, '0')}</span>`
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
                    <span style="color: #10b981; font-weight: bold;">${this.formatCurrency(totalValue)}</span>
                </div>
                <div style="margin-top: 12px;">
                    <div class="numbers-list">${numbersHtml}</div>
                </div>
            </div>

            <form id="payment-form" class="payment-form">
              <div class="form-columns">
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
                            <input type="tel" id="phone" required inputmode="numeric" maxlength="15" placeholder="(91) 99999-9999" autocomplete="tel">
                        </div>
                    </div>
                </div>

                <div class="form-section glass-effect">
                    <h3 style="font-weight: 600; margin-bottom: 12px;">Pagamento PIX</h3>
                    
                    <div class="pix-info">
                        <div class="qr-code">
                            <img src="qr-code-pix.png" alt="QR Code PIX">
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
                                    <div class="pix-value">${this.formatCurrency(totalValue)}</div>
                                    <button type="button" class="copy-btn" onclick="raffleManager.copyToClipboard('${totalValue.toFixed(2)}', 'Valor')">
                                        📋
                                    </button>
                                </div>
                            </div>
                        </div>
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
                    <p>• Os números serão reservados por 24h após finalizar o pedido</p>
                    <p>• O comprovante será enviado na próxima tela</p>
                    <p>• Após a verificação manual, você receberá a confirmação</p>
                </div>
            </form>
        `;

        this.setupFormEvents();
        modal.classList.add('active');
    }

    setupFormEvents() {
        const form = document.getElementById('payment-form');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitPayment();
        });

        // Máscara do telefone
        this.setupPhoneMask(document.getElementById('phone'));
    }

    // Formata o telefone como (DD) NNNNN-NNNN e bloqueia letras
    setupPhoneMask(input) {
        if (!input) return;

        input.addEventListener('input', () => {
            let value = input.value.replace(/\D/g, '').slice(0, 11);

            if (value.length <= 10) {
                value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
            } else {
                value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
            }

            input.value = value.trim();
        });
    }

    isValidPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11;
    }

    async submitPayment() {
        const buyerInfo = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value
        };

        const proofMethod = 'whatsapp';
        const selectedNumbers = Array.from(this.selectedNumbers);
        const totalValue = selectedNumbers.length * this.pricePerNumber;

        if (!buyerInfo.firstName || !buyerInfo.lastName || !buyerInfo.phone) {
            this.showToast('Preencha todos os campos obrigatórios', 'error');
            return;
        }

        if (!this.isValidPhone(buyerInfo.phone)) {
            this.showToast('Digite um telefone válido com DDD.', 'error');
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

            // CRIAR TRANSAÇÃO (comprovante será enviado na tela final)
            const transactionData = {
                numbers: selectedNumbers,
                buyerInfo: buyerInfo,
                totalValue: totalValue,
                proofMethod: proofMethod,
                proofStatus: 'waiting_proof',
                status: 'pending'
            };

            const transactionId = await this.firebase.createTransaction(transactionData);

            // MOSTRAR CONFIRMAÇÃO (com upload do comprovante)
            this.showPaymentConfirmation(transactionId, buyerInfo, selectedNumbers, proofMethod);

            // LIMPAR SELEÇÃO
            this.selectedNumbers.clear();
            this.updateDisplay();

        } catch (error) {
            console.error('Erro ao finalizar pedido:', error);

            if (error.code === 'permission-denied') {
                this.showToast('Erro de permissão. Entre em contato com o administrador.', 'error');
            } else {
                this.showToast('Erro ao finalizar o pedido. Tente novamente.', 'error');
            }
        }
    }

    showPaymentConfirmation(transactionId, buyerInfo, numbers, proofMethod) {
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        const totalValue = numbers.length * this.pricePerNumber;

        modalTitle.textContent = 'Pedido Finalizado!';

        const numbersHtml = numbers.map(num =>
            `<span class="number-badge" style="background: rgba(250, 204, 21, 0.2); color: #facc15; border-color: rgba(250, 204, 21, 0.3);">${num.toString().padStart(3, '0')}</span>`
        ).join('');

        modalContent.innerHTML = `
            <div class="success-content">
                <div class="success-icon" style="font-size: 4rem; margin-bottom: 16px;">✅</div>
                <h3 class="success-title">Pedido criado com sucesso!</h3>
                <p class="success-message">Seus números foram reservados por 24h.</p>

                <div class="order-summary glass-effect">
                    <div class="summary-row">
                        <span>Números reservados:</span>
                        <span>${numbers.length}</span>
                    </div>
                    <div class="summary-row">
                        <span>Valor:</span>
                        <span style="color: #10b981;">${this.formatCurrency(totalValue)}</span>
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

                <div class="proof-instructions glass-effect">
                    <h4 style="font-weight: 600; margin-bottom: 8px;">📱 Enviar comprovante</h4>
                    <p style="font-size: 0.875rem; color: #d1d5db; margin-bottom: 12px;">
                        Agora envie o comprovante pelo WhatsApp com o ID do pedido para a equipe confirmar sua compra.
                    </p>

                    <button type="button" class="btn btn-success btn-full" onclick="raffleManager.openWhatsAppProof()">
                        📱 Enviar comprovante via WhatsApp
                    </button>
                </div>

                <div class="next-steps glass-effect">
                    <h4 style="font-weight: 600; margin-bottom: 8px;">Próximos passos:</h4>
                    <p style="font-size: 0.875rem; color: #d1d5db;">
                        1. Envie o comprovante pelo WhatsApp<br>
                        2. A equipe irá verificar o pagamento<br>
                        3. Seus números serão marcados como vendidos
                    </p>
                </div>

                <button class="btn btn-primary btn-full" onclick="raffleManager.closePaymentModal()">
                    Continuar
                </button>
            </div>
        `;

        this.confirmationData = { transactionId, buyerInfo, numbers, totalValue };
    }

    // Abre o WhatsApp já preenchido para o cliente enviar o comprovante
    openWhatsAppProof() {
        if (!this.confirmationData) {
            this.showToast('Dados do pedido não encontrados. Recarregue a página.', 'error');
            return;
        }

        const { transactionId, buyerInfo, numbers, totalValue } = this.confirmationData;

        let message = `*COMPROVANTE - ${JAMBU_SITE_CONFIG.raffleName.toUpperCase()}*\n\n`;
        message += `*Nome:* ${buyerInfo.firstName} ${buyerInfo.lastName}\n`;
        message += `*Telefone:* ${buyerInfo.phone}\n`;
        message += `*Números:* ${numbers.join(', ')}\n`;
        message += `*Valor:* ${this.formatCurrency(totalValue)}\n`;
        message += `*ID do Pedido:* ${transactionId}\n\n`;
        message += `Segue em anexo o comprovante de pagamento.`;

        const whatsappURL = `https://wa.me/${JAMBU_SITE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
        window.open(whatsappURL, '_blank');

        this.showToast('Abrindo WhatsApp... anexe o comprovante na conversa.', 'success');
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
