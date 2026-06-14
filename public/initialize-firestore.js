// Inicialização e configuração do Firestore
class FirestoreInitializer {
    constructor() {
        this.db = firebase.firestore();
        this.initialized = false;
    }
    async initialize() {
        if (this.initialized) return;
        
        try {
            console.log('Inicializando Firestore...');
            
            // Verificar se já existe configuração
            const configDoc = await this.db.collection('config').doc('raffle').get();
            
            if (!configDoc.exists) {
                console.log('Criando configuração inicial...');
                await this.createInitialConfig();
            }
            
            // Verificar se números já foram inicializados
            const numbersSnapshot = await this.db.collection('raffleNumbers').limit(1).get();
            
            if (numbersSnapshot.empty) {
                console.log('Inicializando números da rifa...');
                await this.initializeNumbers();
            }
            
            this.initialized = true;
            console.log('Firestore inicializado com sucesso!');
            
        } catch (error) {
            console.error('Erro ao inicializar Firestore:', error);
            throw error;
        }
    }

    async createInitialConfig() {
        await this.db.collection('config').doc('raffle').set({
            totalNumbers: 500,
            pricePerNumber: 15,
            title: 'Rifa Jambu Racing',
            prize: 'INSERIR PREMIO AQUI',
            pixKey: 'INSERIR_CHAVE_PIX_AQUI',
            whatsappNumber: 'INSERIR_NUMERO_WHATSAPP_AQUI',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async initializeNumbers() {
        const batch = this.db.batch();
        
        for (let i = 1; i <= 500; i++) {
            const numberRef = this.db.collection('raffleNumbers').doc(i.toString());
            batch.set(numberRef, {
                number: i,
                status: 'available', 
                buyerInfo: null,
                reservedAt: null,
                reservedUntil: null, // SEM PRAZO DE EXPIRAÇÃO
                soldAt: null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        await batch.commit();
        console.log('500 números inicializados no Firestore');
    }

    // Função para adicionar venda manual
    async addManualSale(number, buyerName, buyerPhone = null, buyerEmail = null) {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            
            const buyerInfo = {
                firstName: buyerName.split(' ')[0] || '',
                lastName: buyerName.split(' ').slice(1).join(' ') || '',
                phone: buyerPhone || 'Não informado',
                email: buyerEmail || 'Não informado',
                manualEntry: true
            };

            await numberRef.set({
                number: parseInt(number),
                status: 'sold',
                buyerInfo: buyerInfo,
                soldAt: firebase.firestore.FieldValue.serverTimestamp(),
                reservedAt: null,
                reservedUntil: null,
                manualEntry: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Criar registro da transação
            await this.db.collection('transactions').add({
                numbers: [parseInt(number)],
                buyerInfo: buyerInfo,
                totalValue: 15,
                status: 'confirmed',
                paymentMethod: 'manual',
                manualEntry: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Número ${number} vendido manualmente para ${buyerName}`);
            return true;
            
        } catch (error) {
            console.error('Erro ao adicionar venda manual:', error);
            throw error;
        }
    }

    // Função para reservar número manualmente
    async reserveNumberManually(number, buyerName, buyerPhone = null, reason = 'Reserva manual') {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            
            const buyerInfo = {
                firstName: buyerName.split(' ')[0] || '',
                lastName: buyerName.split(' ').slice(1).join(' ') || '',
                phone: buyerPhone || 'Não informado',
                email: 'Não informado',
                manualReserve: true,
                reserveReason: reason
            };

            await numberRef.set({
                number: parseInt(number),
                status: 'reserved',
                buyerInfo: buyerInfo,
                reservedAt: firebase.firestore.FieldValue.serverTimestamp(),
                reservedUntil: null, // SEM PRAZO DE EXPIRAÇÃO
                manualReserve: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Criar registro da reserva
            await this.db.collection('transactions').add({
                numbers: [parseInt(number)],
                buyerInfo: buyerInfo,
                totalValue: 15,
                status: 'reserved',
                paymentMethod: 'manual_reserve',
                manualReserve: true,
                reserveReason: reason,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Número ${number} reservado manualmente para ${buyerName}`);
            return true;
            
        } catch (error) {
            console.error('Erro ao reservar número manualmente:', error);
            throw error;
        }
    }

    // Função para liberar número (marcar como disponível novamente)
    async releaseNumber(number) {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            
            await numberRef.update({
                status: 'available',
                buyerInfo: null,
                reservedAt: null,
                reservedUntil: null,
                soldAt: null,
                manualEntry: null,
                manualReserve: null,
                releasedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Número ${number} liberado`);
            return true;
            
        } catch (error) {
            console.error('Erro ao liberar número:', error);
            throw error;
        }
    }

    // Função para confirmar pagamento (mudar de reserved para sold)
    async confirmPayment(number, transactionId = null) {
        try {
            const numberRef = this.db.collection('raffleNumbers').doc(number.toString());
            const numberDoc = await numberRef.get();
            
            if (!numberDoc.exists) {
                throw new Error(`Número ${number} não encontrado`);
            }

            const numberData = numberDoc.data();
            if (numberData.status !== 'reserved') {
                throw new Error(`Número ${number} não está reservado`);
            }

            await numberRef.update({
                status: 'sold',
                soldAt: firebase.firestore.FieldValue.serverTimestamp(),
                confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Atualizar transação se fornecida
            if (transactionId) {
                await this.db.collection('transactions').doc(transactionId).update({
                    status: 'confirmed',
                    confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Buscar transação relacionada e atualizar
                const transactionQuery = await this.db.collection('transactions')
                    .where('numbers', 'array-contains', parseInt(number))
                    .where('status', '==', 'pending')
                    .limit(1)
                    .get();
                
                if (!transactionQuery.empty) {
                    const transactionDoc = transactionQuery.docs[0];
                    await transactionDoc.ref.update({
                        status: 'confirmed',
                        confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    // Buscar também por status 'reserved' para reservas manuais
                    const reservedQuery = await this.db.collection('transactions')
                        .where('numbers', 'array-contains', parseInt(number))
                        .where('status', '==', 'reserved')
                        .limit(1)
                        .get();
                    
                    if (!reservedQuery.empty) {
                        const transactionDoc = reservedQuery.docs[0];
                        await transactionDoc.ref.update({
                            status: 'confirmed',
                            confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }

            console.log(`Pagamento do número ${number} confirmado`);
            return true;
            
        } catch (error) {
            console.error('Erro ao confirmar pagamento:', error);
            throw error;
        }
    }

    // Função para obter estatísticas
    async getStats() {
        try {
            const snapshot = await this.db.collection('raffleNumbers').get();
            const stats = {
                available: 0,
                reserved: 0,
                sold: 0,
                total: 0,
                manualSales: 0,
                onlineSales: 0,
                manualReserves: 0,
                onlineReserves: 0
            };

            snapshot.forEach(doc => {
                const data = doc.data();
                stats.total++;
                stats[data.status] = (stats[data.status] || 0) + 1;
                
                if (data.status === 'sold') {
                    if (data.buyerInfo?.manualEntry) {
                        stats.manualSales++;
                    } else {
                        stats.onlineSales++;
                    }
                }
                
                if (data.status === 'reserved') {
                    if (data.manualReserve) {
                        stats.manualReserves++;
                    } else {
                        stats.onlineReserves++;
                    }
                }
            });

            return stats;
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error);
            throw error;
        }
    }
}

// Instância global
window.firestoreInitializer = new FirestoreInitializer();

// Funções globais para uso no console/admin
window.addManualSale = async function(number, name, phone = null, email = null) {
    try {
        await window.firestoreInitializer.addManualSale(number, name, phone, email);
        console.log(`✅ Número ${number} vendido para ${name}`);
        
        // Atualizar display se o raffleManager existir
        if (window.raffleManager) {
            window.raffleManager.updateDisplay();
        }
    } catch (error) {
        console.error(`❌ Erro ao vender número ${number}:`, error);
    }
};

window.reserveNumber = async function(number, name, phone = null, reason = 'Reserva manual') {
    try {
        await window.firestoreInitializer.reserveNumberManually(number, name, phone, reason);
        console.log(`✅ Número ${number} reservado para ${name}`);
        
        // Atualizar display se o raffleManager existir
        if (window.raffleManager) {
            window.raffleManager.updateDisplay();
        }
    } catch (error) {
        console.error(`❌ Erro ao reservar número ${number}:`, error);
    }
};

window.releaseNumber = async function(number) {
    try {
        await window.firestoreInitializer.releaseNumber(number);
        console.log(`✅ Número ${number} liberado`);
        
        // Atualizar display se o raffleManager existir
        if (window.raffleManager) {
            window.raffleManager.updateDisplay();
        }
    } catch (error) {
        console.error(`❌ Erro ao liberar número ${number}:`, error);
    }
};

window.confirmPayment = async function(number, transactionId = null) {
    try {
        await window.firestoreInitializer.confirmPayment(number, transactionId);
        console.log(`✅ Pagamento do número ${number} confirmado`);
        
        // Atualizar display se o raffleManager existir
        if (window.raffleManager) {
            window.raffleManager.updateDisplay();
        }
    } catch (error) {
        console.error(`❌ Erro ao confirmar pagamento do número ${number}:`, error);
    }
};

window.getStats = async function() {
    try {
        const stats = await window.firestoreInitializer.getStats();
        console.log('📊 Estatísticas da Rifa:', stats);
        return stats;
    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error);
    }
};

// Inicializar automaticamente quando o Firebase estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    // Aguardar um pouco para garantir que o Firebase foi inicializado
    setTimeout(async () => {
        try {
            await window.firestoreInitializer.initialize();
        } catch (error) {
            console.error('Erro na inicialização automática:', error);
        }
    }, 1000);
});
