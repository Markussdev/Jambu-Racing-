// Script para configurar usuários administradores iniciais
// Execute este script uma vez para criar contas de admin

class AdminSetup {
    constructor() {
        this.auth = firebase.auth();
        this.db = firebase.firestore();
    }

    // Criar conta de administrador com email e senha
    async createAdminAccount(email, password, displayName = '') {
        try {
            console.log(`Criando conta de administrador para: ${email}`);
            
            // Criar usuário no Firebase Auth
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Atualizar perfil se nome fornecido
            if (displayName) {
                await user.updateProfile({
                    displayName: displayName
                });
            }
            
            // Adicionar email à lista de administradores
            await this.addToAdminList(email);
            
            console.log(`✅ Conta de administrador criada com sucesso para: ${email}`);
            console.log(`📧 Verifique o email para ativar a conta`);
            
            // Enviar email de verificação
            await user.sendEmailVerification();
            
            return user;
            
        } catch (error) {
            console.error(`❌ Erro ao criar conta de admin:`, error);
            
            // Se o usuário já existe, apenas adicionar à lista de admins
            if (error.code === 'auth/email-already-in-use') {
                console.log(`Email ${email} já existe. Adicionando à lista de administradores...`);
                await this.addToAdminList(email);
                console.log(`✅ Email ${email} adicionado à lista de administradores`);
            }
            
            throw error;
        }
    }

    // Adicionar email à lista de administradores no Firestore
    async addToAdminList(email) {
        try {
            const adminConfigRef = this.db.collection('config').doc('admins');
            const adminConfigDoc = await adminConfigRef.get();
            
            let adminEmails = [];
            
            if (adminConfigDoc.exists) {
                adminEmails = adminConfigDoc.data().emails || [];
            }
            
            // Adicionar email se não existir
            const emailLower = email.toLowerCase();
            if (!adminEmails.includes(emailLower)) {
                adminEmails.push(emailLower);
                
                await adminConfigRef.set({
                    emails: adminEmails,
                    createdAt: adminConfigDoc.exists ? adminConfigDoc.data().createdAt : firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`Email ${email} adicionado à lista de administradores`);
            } else {
                console.log(`Email ${email} já está na lista de administradores`);
            }
            
        } catch (error) {
            console.error('Erro ao adicionar à lista de admins:', error);
            throw error;
        }
    }

    // Listar todos os administradores
    async listAdmins() {
        try {
            const adminConfigDoc = await this.db.collection('config').doc('admins').get();
            
            if (adminConfigDoc.exists) {
                const adminEmails = adminConfigDoc.data().emails || [];
                console.log('📋 Administradores cadastrados:');
                adminEmails.forEach((email, index) => {
                    console.log(`${index + 1}. ${email}`);
                });
                return adminEmails;
            } else {
                console.log('❌ Nenhum administrador cadastrado');
                return [];
            }
            
        } catch (error) {
            console.error('Erro ao listar admins:', error);
            throw error;
        }
    }

    // Remover administrador
    async removeAdmin(email) {
        try {
            const adminConfigRef = this.db.collection('config').doc('admins');
            const adminConfigDoc = await adminConfigRef.get();
            
            if (adminConfigDoc.exists) {
                let adminEmails = adminConfigDoc.data().emails || [];
                const emailLower = email.toLowerCase();
                
                adminEmails = adminEmails.filter(adminEmail => adminEmail !== emailLower);
                
                await adminConfigRef.update({
                    emails: adminEmails,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`✅ Administrador ${email} removido`);
            }
            
        } catch (error) {
            console.error('Erro ao remover admin:', error);
            throw error;
        }
    }
}

// Instância global
window.adminSetup = new AdminSetup();

// Funções globais para uso no console
window.createAdmin = async function(email, password, name = '') {
    try {
        await window.adminSetup.createAdminAccount(email, password, name);
    } catch (error) {
        console.error('Erro:', error.message);
    }
};

window.addAdminEmail = async function(email) {
    try {
        await window.adminSetup.addToAdminList(email);
    } catch (error) {
        console.error('Erro:', error.message);
    }
};

window.listAdmins = async function() {
    try {
        return await window.adminSetup.listAdmins();
    } catch (error) {
        console.error('Erro:', error.message);
    }
};

window.removeAdmin = async function(email) {
    try {
        await window.adminSetup.removeAdmin(email);
    } catch (error) {
        console.error('Erro:', error.message);
    }
};

// Instruções de uso
console.log