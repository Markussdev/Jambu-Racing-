// Painel de Administração para Rifa - Supabase
class AdminPanel {
    constructor() {
        this.client = supabaseClient;
        this.pricePerNumber = JAMBU_SITE_CONFIG.pricePerNumber || 3;
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.numbers = [];
        this.transactions = [];
        this.channel = null;
        this.reloadTimer = null;

        this.init();
    }

    async init() {
        try {
            await this.loadAll();
            this.setupEventListeners();
            this.setupRealTimeListener();
        } catch (error) {
            console.error('Erro ao iniciar painel admin:', error);
            this.showMessage('Erro ao carregar painel administrativo', 'error');
        }
    }

    async loadAll() {
        await Promise.all([
            this.loadNumbers(false),
            this.loadTransactions(false)
        ]);

        this.displayNumbers(this.numbers);
        this.updateStats(this.numbers);
    }

    async loadNumbers(shouldRender = true) {
        try {
            const { data, error } = await this.client
                .from('raffle_numbers')
                .select(`
                    number,
                    status,
                    reserved_at,
                    reserved_until,
                    sold_at,
                    confirmed_at,
                    current_transaction_id,
                    manual_entry,
                    manual_reserve,
                    release_reason,
                    created_at,
                    updated_at
                `)
                .order('number', { ascending: true });

            if (error) throw error;

            this.numbers = data || [];

            if (shouldRender) {
                this.displayNumbers(this.numbers);
                this.updateStats(this.numbers);
            }

            return this.numbers;
        } catch (error) {
            console.error('Erro ao carregar números:', error);
            this.showMessage(`Erro ao carregar números: ${error.message}`, 'error');
            return [];
        }
    }

    async loadTransactions(shouldRender = true) {
        try {
            const { data, error } = await this.client
                .from('transactions')
                .select(`
                    id,
                    numbers,
                    buyer_name,
                    buyer_phone,
                    buyer_email,
                    total_value,
                    status,
                    proof_method,
                    proof_status,
                    reserved_until,
                    confirmed_at,
                    cancelled_at,
                    expired_at,
                    archived_at,
                    manual_entry,
                    manual_reserve,
                    notes,
                    created_at,
                    updated_at
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.transactions = data || [];
            console.log('Transações carregadas:', this.transactions.length);

            if (shouldRender) {
                this.displayNumbers(this.numbers);
            }

            return this.transactions;
        } catch (error) {
            console.error('Erro ao carregar transações:', error);
            this.showMessage(`Erro ao carregar transações: ${error.message}`, 'error');
            return [];
        }
    }

    setupRealTimeListener() {
        if (this.channel) {
            this.client.removeChannel(this.channel);
            this.channel = null;
        }

        this.channel = this.client
            .channel('admin-raffle-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'raffle_numbers' },
                () => this.scheduleReload()
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'transactions' },
                () => this.scheduleReload()
            )
            .subscribe((status) => {
                console.log('Admin realtime:', status);
            });
    }

    scheduleReload() {
        clearTimeout(this.reloadTimer);

        this.reloadTimer = setTimeout(async () => {
            await this.loadAll();
        }, 500);
    }

    getTransactionForNumber(numberData) {
        if (!numberData) return null;

        if (numberData.current_transaction_id) {
            return this.transactions.find(t => t.id === numberData.current_transaction_id) || null;
        }

        return this.transactions.find(t =>
            Array.isArray(t.numbers) &&
            t.numbers.includes(numberData.number) &&
            t.status !== 'archived_after_reset'
        ) || null;
    }

    displayNumbers(numbers) {
        const container = document.getElementById('numbers-container');
        if (!container) return;

        const filteredNumbers = this.filterNumbers(numbers);

        container.innerHTML = filteredNumbers.map(number => {
            const transaction = this.getTransactionForNumber(number);
            const buyerName = transaction?.buyer_name || '';
            const buyerPhone = transaction?.buyer_phone || '';
            const buyerEmail = transaction?.buyer_email || '';
            const isManual = number.manual_entry || transaction?.manual_entry;
            const isManualReserve = number.manual_reserve || transaction?.manual_reserve;

            return `
                <div class="admin-number-card ${number.status}" data-number="${number.number}">
                    <div class="number-header">
                        <span class="number-value">${number.number.toString().padStart(3, '0')}</span>
                        <span class="status-badge ${number.status}">${this.getStatusLabel(number.status)}</span>
                    </div>

                    ${transaction ? `
                        <div class="buyer-info">
                            ${buyerName ? `<strong>${this.escapeHTML(buyerName)}</strong>` : ''}
                            ${buyerPhone ? `<div>📱 ${this.escapeHTML(buyerPhone)}</div>` : ''}
                            ${buyerEmail ? `<div>📧 ${this.escapeHTML(buyerEmail)}</div>` : ''}
                            <div>Pedido: <span style="font-size: 0.75rem;">${transaction.id}</span></div>
                            <div>Status pedido: ${this.getTransactionStatusLabel(transaction.status)}</div>
                            <div>Comprovante: ${this.getProofStatusLabel(transaction.proof_status)}</div>
                            ${isManual ? '<div class="manual-entry-badge">Venda Manual</div>' : ''}
                            ${isManualReserve ? '<div class="manual-entry-badge">Reserva Manual</div>' : ''}
                        </div>
                    ` : ''}

                    ${number.status === 'reserved' && number.reserved_until ? `
                        <div class="timestamp">
                            Expira em: ${this.formatDate(number.reserved_until)}
                        </div>
                    ` : ''}

                    <div class="number-actions">
                        ${number.status === 'available' ? `
                            <button onclick="adminPanel.sellNumber(${number.number})" class="btn-sell">Vender</button>
                            <button onclick="adminPanel.reserveNumber(${number.number})" class="btn-reserve">Reservar</button>
                        ` : ''}

                        ${number.status === 'reserved' ? `
                            <button onclick="adminPanel.confirmPayment(${number.number})" class="btn-confirm">✅ Confirmar</button>
                            <button onclick="adminPanel.releaseNumber(${number.number})" class="btn-release">🔓 Liberar</button>
                        ` : ''}

                        ${number.status === 'sold' ? `
                            <button onclick="adminPanel.releaseNumber(${number.number})" class="btn-release">🔓 Liberar</button>
                        ` : ''}
                    </div>

                    ${number.sold_at || number.reserved_at ? `
                        <div class="timestamp">
                            ${number.sold_at ? `Vendido: ${this.formatDate(number.sold_at)}` : ''}
                            ${number.reserved_at ? `Reservado: ${this.formatDate(number.reserved_at)}` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    filterNumbers(numbers) {
        let filtered = [...numbers];

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(number => number.status === this.currentFilter);
        }

        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();

            filtered = filtered.filter(number => {
                const transaction = this.getTransactionForNumber(number);
                const text = [
                    number.number?.toString(),
                    number.status,
                    transaction?.buyer_name,
                    transaction?.buyer_phone,
                    transaction?.buyer_email,
                    transaction?.id
                ].filter(Boolean).join(' ').toLowerCase();

                return text.includes(query);
            });
        }

        return filtered;
    }

    updateStats(numbers) {
        const stats = {
            available: numbers.filter(n => n.status === 'available').length,
            reserved: numbers.filter(n => n.status === 'reserved').length,
            sold: numbers.filter(n => n.status === 'sold').length,
            total: numbers.length
        };

        const totalRevenue = stats.sold * this.pricePerNumber;

        document.getElementById('stat-available').textContent = stats.available;
        document.getElementById('stat-reserved').textContent = stats.reserved;
        document.getElementById('stat-sold').textContent = stats.sold;
        document.getElementById('stat-total').textContent = stats.total;

        document.getElementById('stat-revenue').textContent = totalRevenue.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;
                this.displayNumbers(this.numbers);
            });
        });

        document.getElementById('manual-sale-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleManualSale();
        });

        document.getElementById('manual-reserve-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleManualReserve();
        });

        document.getElementById('search-input')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim();
            this.displayNumbers(this.numbers);
        });

        this.setupPhoneMask(document.getElementById('sale-phone'));
        this.setupPhoneMask(document.getElementById('reserve-phone'));
    }

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

    async sellNumber(number) {
        const name = prompt('Nome do comprador:');
        if (!name) return;

        const phone = prompt('Telefone (opcional):') || null;
        const email = prompt('Email (opcional):') || null;

        try {
            await this.adminManualSale(number, name, phone, email);
            this.showMessage(`Número ${number} vendido para ${name}`, 'success');
            await this.loadAll();
        } catch (error) {
            this.showMessage(`Erro ao vender número ${number}: ${error.message}`, 'error');
        }
    }

    async reserveNumber(number) {
        const name = prompt('Nome da pessoa para reserva:');
        if (!name) return;

        const phone = prompt('Telefone (opcional):') || null;
        const reason = prompt('Motivo da reserva:') || 'Reserva manual';

        try {
            await this.adminManualReserve(number, name, phone, reason);
            this.showMessage(`Número ${number} reservado para ${name}`, 'success');
            await this.loadAll();
        } catch (error) {
            this.showMessage(`Erro ao reservar número ${number}: ${error.message}`, 'error');
        }
    }

    async confirmPayment(number) {
        const numberData = this.numbers.find(n => n.number === number);
        const transactionId = numberData?.current_transaction_id;

        if (!transactionId) {
            this.showMessage('Não encontrei o pedido relacionado a esse número.', 'error');
            return;
        }

        if (!confirm(`Confirmar pagamento do número ${number}?`)) return;

        try {
            const { error } = await this.client.rpc('admin_confirm_transaction', {
                p_transaction_id: transactionId
            });

            if (error) throw error;

            this.showMessage(`Pagamento do número ${number} confirmado`, 'success');
            await this.loadAll();
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error);
            this.showMessage(`Erro ao confirmar pagamento: ${error.message}`, 'error');
        }
    }

    async releaseNumber(number) {
        if (!confirm(`Liberar número ${number}? Ele ficará disponível novamente.`)) return;

        try {
            const { error } = await this.client.rpc('admin_release_number', {
                p_number: number
            });

            if (error) throw error;

            this.showMessage(`Número ${number} liberado`, 'success');
            await this.loadAll();
        } catch (error) {
            console.error('Erro ao liberar número:', error);
            this.showMessage(`Erro ao liberar número: ${error.message}`, 'error');
        }
    }

    async handleManualSale() {
        const number = parseInt(document.getElementById('sale-number').value);
        const name = document.getElementById('sale-name').value.trim();
        const phone = document.getElementById('sale-phone').value.trim() || null;
        const email = document.getElementById('sale-email').value.trim() || null;

        if (!number || !name) {
            this.showMessage('Número e nome são obrigatórios', 'error');
            return;
        }

        if (phone && !this.isValidPhone(phone)) {
            this.showMessage('Telefone inválido. Use DDD + número.', 'error');
            return;
        }

        try {
            await this.adminManualSale(number, name, phone, email);
            this.showMessage(`Número ${number} vendido para ${name}`, 'success');
            document.getElementById('manual-sale-form').reset();
            await this.loadAll();
        } catch (error) {
            console.error('Erro na venda manual:', error);
            this.showMessage(`Erro ao vender número: ${error.message}`, 'error');
        }
    }

    async handleManualReserve() {
        const number = parseInt(document.getElementById('reserve-number').value);
        const name = document.getElementById('reserve-name').value.trim();
        const phone = document.getElementById('reserve-phone').value.trim() || null;
        const reason = document.getElementById('reserve-reason').value.trim() || 'Reserva manual';

        if (!number || !name) {
            this.showMessage('Número e nome são obrigatórios', 'error');
            return;
        }

        if (phone && !this.isValidPhone(phone)) {
            this.showMessage('Telefone inválido. Use DDD + número.', 'error');
            return;
        }

        try {
            await this.adminManualReserve(number, name, phone, reason);
            this.showMessage(`Número ${number} reservado para ${name}`, 'success');
            document.getElementById('manual-reserve-form').reset();
            await this.loadAll();
        } catch (error) {
            console.error('Erro na reserva manual:', error);
            this.showMessage(`Erro ao reservar número: ${error.message}`, 'error');
        }
    }

    async adminManualSale(number, name, phone, email) {
        const { error } = await this.client.rpc('admin_manual_sale', {
            p_number: number,
            p_buyer_name: name,
            p_buyer_phone: phone,
            p_buyer_email: email
        });

        if (error) throw error;
    }

    async adminManualReserve(number, name, phone, reason) {
        const { error } = await this.client.rpc('admin_manual_reserve', {
            p_number: number,
            p_buyer_name: name,
            p_buyer_phone: phone,
            p_reason: reason
        });

        if (error) throw error;
    }

    async confirmResetRaffle() {
        const phrase = prompt('Digite RESETAR para confirmar que deseja zerar a rifa:');

        if (phrase !== 'RESETAR') {
            this.showMessage('Reset cancelado', 'error');
            return;
        }

        const password = prompt('Digite a senha de confirmação:');

        if (password !== 'jambu-reset-2026') {
            this.showMessage('Senha incorreta', 'error');
            return;
        }

        if (!confirm('Tem certeza? Todos os números voltarão para disponíveis.')) return;

        try {
            const { data, error } = await this.client.rpc('admin_reset_raffle', {});

            if (error) {
                console.error('Erro Supabase reset:', JSON.stringify(error, null, 2));
                throw new Error(error.message || error.details || error.hint || JSON.stringify(error));
            }

            this.showMessage('Rifa resetada com sucesso!', 'success');
            await this.loadAll();
        } catch (error) {
            console.error('Erro ao resetar rifa:', error);
            this.showMessage(`Erro ao resetar rifa: ${error.message || JSON.stringify(error)}`, 'error');
        }
    }

    async exportData() {
        try {
            const rows = this.numbers.map(number => {
                const transaction = this.getTransactionForNumber(number);

                return {
                    numero: number.number,
                    status: this.getStatusLabel(number.status),
                    comprador: transaction?.buyer_name || '',
                    telefone: transaction?.buyer_phone || '',
                    email: transaction?.buyer_email || '',
                    valor: transaction?.total_value || '',
                    status_pedido: transaction ? this.getTransactionStatusLabel(transaction.status) : '',
                    comprovante: transaction ? this.getProofStatusLabel(transaction.proof_status) : '',
                    vendido_em: number.sold_at ? this.formatDate(number.sold_at) : '',
                    reservado_em: number.reserved_at ? this.formatDate(number.reserved_at) : '',
                    expira_em: number.reserved_until ? this.formatDate(number.reserved_until) : '',
                    venda_manual: number.manual_entry ? 'Sim' : 'Não',
                    reserva_manual: number.manual_reserve ? 'Sim' : 'Não',
                    pedido_id: transaction?.id || ''
                };
            });

            const csv = this.arrayToCSV(rows);
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
            ...array.map(row =>
                headers.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')
            )
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

        URL.revokeObjectURL(url);
    }

    getStatusLabel(status) {
        const labels = {
            available: 'Disponível',
            reserved: 'Reservado',
            sold: 'Vendido'
        };

        return labels[status] || status;
    }

    getTransactionStatusLabel(status) {
        const labels = {
            pending: 'Pendente',
            confirmed: 'Confirmado',
            cancelled: 'Cancelado',
            expired: 'Expirado',
            archived_after_reset: 'Arquivado'
        };

        return labels[status] || status;
    }

    getProofStatusLabel(status) {
        const labels = {
            waiting_proof: 'Aguardando comprovante',
            sent_whatsapp: 'Enviado via WhatsApp',
            confirmed: 'Confirmado',
            rejected: 'Rejeitado'
        };

        return labels[status] || status || '';
    }

    formatDate(value) {
        if (!value) return '';

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return '';

        return date.toLocaleString('pt-BR');
    }

    escapeHTML(value) {
        return String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    showMessage(message, type = 'success') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `admin-message ${type}`;
        messageDiv.textContent = message;

        document.body.appendChild(messageDiv);

        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }
}

window.AdminPanel = AdminPanel;
