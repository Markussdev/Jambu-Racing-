// Painel de Administração para Rifa
class AdminPanel {
    constructor() {
        this.db = firebase.firestore();
        this.storage = firebase.storage();
        this.currentFilter = 'all';
        this.transactions = [];
        this.init();
    }

    async init() {
        await this.loadNumbers();
        await this.loadTransactions();
        this.setupEventListeners();
        this.setupRealTimeListener();
    }

    async loadNumbers() {
        try {
            const snapshot = await this.db.collection('raffleNumbers').orderBy('number').get();
            const numbers = [];
            
            snapshot.forEach(doc => {
                numbers.push({ id: doc.id, ...doc.data() });
            });
            
            this.displayNumbers(numbers);
            this.updateStats(numbers);
        } catch (error) {
            console.error('Erro ao carregar números:', error);
        }
    }

    async loadTransactions() {
        try {
            const snapshot = await this.db.collection('transactions').orderBy('createdAt', 'desc').get();
            this.transactions = [];
            
            snapshot.forEach(doc => {
                this.transactions.push({ id: doc.id, ...doc.data() });
            });
            
            console.log('Transações carregadas:', this.transactions.length);
            console.log('Transações com comprovante:', this.transactions.filter(t => t.paymentProof).length);
        } catch (error) {
            console.error('Erro ao carregar transações:', error);
        }
    }

    setupRealTimeListener() {
        // Listener para números
        this.db.collection('raffleNumbers').orderBy('number').onSnapshot(snapshot => {
            const numbers = [];
            snapshot.forEach(doc => {
                numbers.push({ id: doc.id, ...doc.data() });
            });
            this.displayNumbers(numbers);
            this.updateStats(numbers);
        });

        // Listener para transações
        this.db.collection('transactions').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
            this.transactions = [];
            snapshot.forEach(doc => {
                this.transactions.push({ id: doc.id, ...doc.data() });
            });
            console.log('Transações atualizadas em tempo real:', this.transactions.length);
            // Recarregar display quando transações mudarem
            this.loadNumbers();
        });
    }

    displayNumbers(numbers) {
        const container = document.getElementById('numbers-container');
        if (!container) return;

        const filteredNumbers = this.filterNumbers(numbers);
        
        container.innerHTML = filteredNumbers.map(number => {
            // Buscar transação relacionada para obter comprovante
            const transaction = this.transactions.find(t => 
                t.numbers && Array.isArray(t.numbers) && t.numbers.includes(number.number)
            );

            console.log(`Número ${number.number}:`, {
                hasTransaction: !!transaction,
                hasProof: transaction ? !!transaction.paymentProof : false,
                proofURL: transaction ? transaction.paymentProof : null
            });

            return `
            <div class="admin-number-card ${number.status}" data-number="${number.number}">
                <div class="number-header">
                    <span class="number-value">${number.number}</span>
                    <span class="status-badge ${number.status}">${this.getStatusLabel(number.status)}</span>
                </div>
                
                ${number.buyerInfo ? `
                    <div class="buyer-info">
                        <strong>${number.buyerInfo.firstName} ${number.buyerInfo.lastName}</strong>
                        <div>📱 ${number.buyerInfo.phone}</div>
                        ${number.buyerInfo.email && number.buyerInfo.email !== 'Não informado' ? `<div>📧 ${number.buyerInfo.email}</div>` : ''}
                        ${number.buyerInfo.manualEntry ? '<div class="manual-entry-badge"> Venda Manual</div>' : ''}
                        ${number.manualReserve ? '<div class="manual-entry-badge">Reserva Manual</div>' : ''}
                    </div>
                ` : ''}

                ${transaction && transaction.paymentProof ? `
                    <div class="payment-proof-section">
                        <div class="proof-header">
                            <span>📎 Comprovante Anexado</span>
                        </div>
                        <div class="proof-actions">
                            <button onclick="adminPanel.viewProof('${transaction.paymentProof}')" class="btn-view-proof">
                                 Ver Comprovante
                            </button>
                            <button onclick="adminPanel.downloadProof('${transaction.paymentProof}', ${number.number})" class="btn-download-proof">
                                 Baixar
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                <div class="number-actions">
                    ${number.status === 'available' ? `
                        <button onclick="adminPanel.sellNumber(${number.number})" class="btn-sell"> Vender</button>
                        <button onclick="adminPanel.reserveNumber(${number.number})" class="btn-reserve"> Reservar</button>
                    ` : ''}
                    
                    ${number.status === 'reserved' ? `
                        <button onclick="adminPanel.confirmPayment(${number.number})" class="btn-confirm">✅ Confirmar</button>
                        <button onclick="adminPanel.releaseNumber(${number.number})" class="btn-release">🔓 Liberar</button>
                    ` : ''}
                    
                    ${number.status === 'sold' ? `
                        <button onclick="adminPanel.releaseNumber(${number.number})" class="btn-release">🔓 Liberar</button>
                    ` : ''}
                </div>
                
                ${number.soldAt || number.reservedAt ? `
                    <div class="timestamp">
                        ${number.soldAt ? `Vendido: ${this.formatDate(number.soldAt)}` : ''}
                        ${number.reservedAt ? `Reservado: ${this.formatDate(number.reservedAt)}` : ''}
                    </div>
                ` : ''}
            </div>
        `}).join('');
    }

    filterNumbers(numbers) {
        if (this.currentFilter === 'all') return numbers;
        return numbers.filter(number => number.status === this.currentFilter);
    }

    updateStats(numbers) {
        const stats = {
            available: numbers.filter(n => n.status === 'available').length,
            reserved: numbers.filter(n => n.status === 'reserved').length,
            sold: numbers.filter(n => n.status === 'sold').length,
            total: numbers.length
        };

        // Atualizar elementos do DOM
        const availableElement = document.getElementById('stat-available');
        const reservedElement = document.getElementById('stat-reserved');
        const soldElement = document.getElementById('stat-sold');
        const totalElement = document.getElementById('stat-total');
        const revenueElement = document.getElementById('stat-revenue');

        if (availableElement) availableElement.textContent = stats.available;
        if (reservedElement) reservedElement.textContent = stats.reserved;
        if (soldElement) soldElement.textContent = stats.sold;
        if (totalElement) totalElement.textContent = stats.total;
        
        // Calcular faturamento total (incluindo vendas manuais)
        const totalRevenue = stats.sold * 15;
        if (revenueElement) revenueElement.textContent = `R$ ${totalRevenue.toFixed(2)}`;
        
        console.log('Stats atualizadas:', stats, 'Faturamento:', totalRevenue);
    }

    setupEventListeners() {
        // Filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.loadNumbers();
            });
        });

        // Formulário de venda manual
        document.getElementById('manual-sale-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleManualSale();
        });

        // Formulário de reserva manual
        document.getElementById('manual-reserve-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleManualReserve();
        });

        // Busca
        document.getElementById('search-input')?.addEventListener('input', (e) => {
            this.searchNumbers(e.target.value);
        });
    }

    async sellNumber(number) {
        const name = prompt('Nome do comprador:');
        if (!name) return;
        
        const phone = prompt('Telefone (opcional):') || null;
        const email = prompt('Email (opcional):') || null;
        
        try {
            await window.firestoreInitializer.addManualSale(number, name, phone, email);
            this.showMessage(`Número ${number} vendido para ${name}`, 'success');
        } catch (error) {
            this.showMessage(`Erro ao vender número ${number}: ${error.message}`, 'error');
        }
    }

    async reserveNumber(number) {
        const name = prompt('Nome da pessoa (para reserva):');
        if (!name) return;
        
        const phone = prompt('Telefone (opcional):') || null;
        const reason = prompt('Motivo da reserva (ex: pagamento em dinheiro):') || 'Reserva manual';
        
        try {
            // REMOVIDO O PRAZO DE EXPIRAÇÃO - reserva por tempo indeterminado
            await this.db.collection('raffleNumbers').doc(number.toString()).update({
                status: 'reserved',
                buyerInfo: {
                    firstName: name.split(' ')[0] || '',
                    lastName: name.split(' ').slice(1).join(' ') || '',
                    phone: phone || 'Não informado',
                    email: 'Não informado',
                    manualReserve: true,
                    reserveReason: reason
                },
                reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
                reservedUntil: null, // SEM PRAZO DE EXPIRAÇÃO
                manualReserve: true
            });
            
            this.showMessage(`Número ${number} reservado para ${name} por tempo indeterminado`, 'success');
        } catch (error) {
            this.showMessage(`Erro ao reservar número ${number}: ${error.message}`, 'error');
        }
    }

    async confirmPayment(number) {
        if (!confirm(`Confirmar pagamento do número ${number}?`)) return;
        
        try {
            await window.firestoreInitializer.confirmPayment(number);
            this.showMessage(`Pagamento do número ${number} confirmado`, 'success');
        } catch (error) {
            this.showMessage(`Erro ao confirmar pagamento: ${error.message}`, 'error');
        }
    }

    async releaseNumber(number) {
        if (!confirm(`Liberar número ${number}? Ele ficará disponível novamente.`)) return;
        
        try {
            await window.firestoreInitializer.releaseNumber(number);
            this.showMessage(`Número ${number} liberado`, 'success');
        } catch (error) {
            this.showMessage(`Erro ao liberar número: ${error.message}`, 'error');
        }
    }

    async handleManualSale() {
        const number = document.getElementById('sale-number').value;
        const name = document.getElementById('sale-name').value;
        const phone = document.getElementById('sale-phone').value || null;
        const email = document.getElementById('sale-email').value || null;
        
        if (!number || !name) {
            this.showMessage('Número e nome são obrigatórios', 'error');
            return;
        }
        
        try {
            await window.firestoreInitializer.addManualSale(parseInt(number), name, phone, email);
            this.showMessage(`Número ${number} vendido para ${name}`, 'success');
            
            // Limpar formulário
            document.getElementById('manual-sale-form').reset();
        } catch (error) {
            this.showMessage(`Erro ao vender número: ${error.message}`, 'error');
        }
    }

    async handleManualReserve() {
        const number = document.getElementById('reserve-number').value;
        const name = document.getElementById('reserve-name').value;
        const phone = document.getElementById('reserve-phone').value || null;
        const reason = document.getElementById('reserve-reason').value || 'Reserva manual';
        
        if (!number || !name) {
            this.showMessage('Número e nome são obrigatórios', 'error');
            return;
        }
        
        try {
            await this.reserveNumber(parseInt(number));
            this.showMessage(`Número ${number} reservado para ${name}`, 'success');
            
            // Limpar formulário
            document.getElementById('manual-reserve-form').reset();
        } catch (error) {
            this.showMessage(`Erro ao reservar número: ${error.message}`, 'error');
        }
    }

    // Visualizar comprovante
    async viewProof(proofURL) {
        try {
            console.log('Abrindo comprovante:', proofURL);
            
            // Criar modal para visualizar comprovante
            const modal = document.createElement('div');
            modal.className = 'modal-overlay active';
            modal.innerHTML = `
                <div class="modal glass-effect" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 class="modal-title">Comprovante de Pagamento</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
                    </div>
                    <div class="modal-content" style="text-align: center;">
                        <img src="${proofURL}" alt="Comprovante" style="max-width: 100%; height: auto; border-radius: 8px;" 
                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm8gYW8gY2FycmVnYXI8L3RleHQ+PC9zdmc+';">
                        <div style="margin-top: 16px;">
                            <button class="btn btn-primary" onclick="window.open('${proofURL}', '_blank')">
                                🔗 Abrir em Nova Aba
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Fechar modal clicando fora
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                }
            });
            
        } catch (error) {
            console.error('Erro ao visualizar comprovante:', error);
            this.showMessage('Erro ao visualizar comprovante', 'error');
        }
    }

    // Baixar comprovante
    async downloadProof(proofURL, number) {
        try {
            const response = await fetch(proofURL);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `comprovante_numero_${number}.jpg`;
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showMessage('Comprovante baixado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao baixar comprovante:', error);
            this.showMessage('Erro ao baixar comprovante', 'error');
        }
    }

    searchNumbers(query) {
        if (!query) {
            this.loadNumbers();
            return;
        }
        
        const cards = document.querySelectorAll('.admin-number-card');
        cards.forEach(card => {
            const number = card.dataset.number;
            const text = card.textContent.toLowerCase();
            const matches = number.includes(query) || text.includes(query.toLowerCase());
            card.style.display = matches ? 'block' : 'none';
        });
    }

    getStatusLabel(status) {
        const labels = {
            available: 'Disponível',
            reserved: 'Reservado',
            sold: 'Vendido'
        };
        return labels[status] || status;
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('pt-BR');
    }

    showMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `admin-message ${type}`;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    // Exportar dados
    async exportData() {
        try {
            const snapshot = await this.db.collection('raffleNumbers').get();
            const numbers = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                numbers.push({
                    numero: data.number,
                    status: data.status,
                    comprador: data.buyerInfo ? `${data.buyerInfo.firstName} ${data.buyerInfo.lastName}` : '',
                    telefone: data.buyerInfo ? data.buyerInfo.phone : '',
                    email: data.buyerInfo ? data.buyerInfo.email : '',
                    vendido_em: data.soldAt ? this.formatDate(data.soldAt) : '',
                    reservado_em: data.reservedAt ? this.formatDate(data.reservedAt) : '',
                    venda_manual: data.buyerInfo?.manualEntry ? 'Sim' : 'Não',
                    reserva_manual: data.manualReserve ? 'Sim' : 'Não'
                });
            });
            
            const csv = this.arrayToCSV(numbers);
            this.downloadCSV(csv, 'rifa-dados.csv');
            
        } catch (error) {
            this.showMessage(`Erro ao exportar dados: ${error.message}`, 'error');
        }
    }

    arrayToCSV(array) {
        if (array.length === 0) return '';
        
        const headers = Object.keys(array[0]);
        const csvContent = [
            headers.join(','),
            ...array.map(row => headers.map(header => `"${row[header]}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Inicializar painel admin
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});