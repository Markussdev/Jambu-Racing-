// Sistema de Autenticação para Admin
class AdminAuth {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.isAuthenticated = false;
        this.currentUser = null;
        this.originalContent = null; // Armazenar o conteúdo original
        this.init();
    }

    async init() {
        // Armazenar o conteúdo original da página antes de qualquer modificação
        if (document.body.innerHTML && !this.originalContent) {
            this.originalContent = document.body.innerHTML;
        }
        
        // Verificar se já existe configuração de admins
        await this.ensureAdminConfig();
        
        // Verificar estado de autenticação
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                const isAdmin = await this.checkIfUserIsAdmin(user.email);
                if (isAdmin) {
                    this.isAuthenticated = true;
                    this.currentUser = user;
                    this.showAdminPanel();
                } else {
                    this.showUnauthorizedMessage();
                    this.auth.signOut();
                }
            } else {
                this.isAuthenticated = false;
                this.currentUser = null;
                this.showLoginForm();
            }
        });
    }

    async ensureAdminConfig() {
        try {
            const adminConfigDoc = await this.db.collection('config').doc('admins').get();
            const defaultAdminEmail = 'equipebajanazare@gmail.com';
            
            if (!adminConfigDoc.exists) {
                // Criar configuração inicial com emails de administradores
                await this.db.collection('config').doc('admins').set({
                    emails: [
                        defaultAdminEmail
                    ],
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('Configuração de administradores criada');
            } else {
                const currentEmails = adminConfigDoc.data().emails || [];
                if (!currentEmails.includes(defaultAdminEmail)) {
                    await adminConfigDoc.ref.update({
                        emails: firebase.firestore.FieldValue.arrayUnion(defaultAdminEmail),
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao configurar administradores:', error);
        }
    }

    async checkIfUserIsAdmin(email) {
        try {
            const adminConfigDoc = await this.db.collection('config').doc('admins').get();
            
            if (adminConfigDoc.exists) {
                const adminEmails = adminConfigDoc.data().emails || [];
                return adminEmails.includes(email.toLowerCase());
            }
            
            return false;
        } catch (error) {
            console.error('Erro ao verificar admin:', error);
            return false;
        }
    }

    showLoginForm() {
        document.body.innerHTML = `
            <div class="bg-raffle">
                <div class="overlay">
                    <div class="login-container">
                        <div class="login-card glass-effect">
                            <div class="login-header">
                                <h1 class="login-title"> Acesso Administrativo</h1>
                                <p class="login-subtitle">Rifa Jambu Racing</p>
                            </div>
                            
                            <div class="login-form">
                                <div class="form-group">
                                    <label for="admin-email">Email do Administrador</label>
                                    <input type="email" id="admin-email" placeholder="seu@email.com" required>
                                </div>
                                
                                <div class="form-group">
                                    <label for="admin-password">Senha</label>
                                    <input type="password" id="admin-password" placeholder="••••••••" required>
                                    <div class="password-hint">
                                        Só os manda chuva pode entrar
                                    </div>
                                </div>
                                
                                <button id="login-btn" class="btn-login">
                                    <span class="login-text">Entrar no Admin</span>
                                    <span class="login-spinner" style="display: none;">⏳</span>
                                </button>
                                
                                <div class="login-footer">
                                    <a href="index.html" class="back-link">← Voltar ao Site</a>
                                </div>
                            </div>
                            
                            <div id="login-message" class="login-message" style="display: none;"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .login-container {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 2rem;
                }
                
                .login-card {
                    width: 100%;
                    max-width: 400px;
                    padding: 2rem;
                    border-radius: 16px;
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }
                
                .login-header {
                    text-align: center;
                    margin-bottom: 2rem;
                }
                
                .login-title {
                    font-family: 'Orbitron', monospace;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #ffffff;
                    margin-bottom: 0.5rem;
                }
                
                .login-subtitle {
                    font-family: 'Orbitron', monospace;
                    font-size: 0.875rem;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0;
                }
                
                .form-group {
                    margin-bottom: 1.5rem;
                }
                
                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                    color: rgba(255, 255, 255, 0.9);
                    font-family: 'Orbitron', monospace;
                    font-weight: 400;
                }
                
                .form-group input {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border-radius: 8px;
                    font-size: 0.875rem;
                    font-family: 'Orbitron', monospace;
                    transition: all 0.3s;
                    box-sizing: border-box;
                }
                
                .form-group input:focus {
                    outline: none;
                    border-color: #10b981;
                    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
                }
                
                .form-group input::placeholder {
                    color: rgba(255, 255, 255, 0.5);
                }
                
                .password-hint {
                    margin-top: 0.5rem;
                    font-size: 0.75rem;
                    color: #10b981;
                    font-family: 'Orbitron', monospace;
                    text-align: center;
                    background: rgba(16, 185, 129, 0.1);
                    padding: 0.5rem;
                    border-radius: 4px;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }
                
                .btn-login {
                    width: 100%;
                    padding: 0.875rem;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-family: 'Orbitron', monospace;
                    transition: all 0.3s;
                    margin-bottom: 1rem;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                }
                
                .btn-login:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
                }
                
                .btn-login:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }
                
                .login-footer {
                    text-align: center;
                    margin-top: 1.5rem;
                }
                
                .back-link {
                    color: rgba(255, 255, 255, 0.7);
                    text-decoration: none;
                    font-family: 'Orbitron', monospace;
                    font-size: 0.875rem;
                    transition: color 0.3s;
                }
                
                .back-link:hover {
                    color: white;
                }
                
                .login-message {
                    margin-top: 1rem;
                    padding: 0.75rem;
                    border-radius: 6px;
                    font-size: 0.875rem;
                    font-family: 'Orbitron', monospace;
                    text-align: center;
                }
                
                .login-message.success {
                    background: rgba(16, 185, 129, 0.2);
                    border: 1px solid rgba(16, 185, 129, 0.5);
                    color: #10b981;
                }
                
                .login-message.error {
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.5);
                    color: #ef4444;
                }
                
                @media (max-width: 480px) {
                    .login-container {
                        padding: 1rem;
                    }
                    
                    .login-card {
                        padding: 1.5rem;
                    }
                }
            </style>
        `;
        
        this.setupLoginEventListeners();
    }

    setupLoginEventListeners() {
        const loginBtn = document.getElementById('login-btn');
        const emailInput = document.getElementById('admin-email');
        const passwordInput = document.getElementById('admin-password');

        // Login com email/senha
        loginBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            if (!email || !password) {
                this.showLoginMessage('Por favor, preencha todos os campos', 'error');
                return;
            }
            
            await this.loginWithEmailPassword(email, password);
        });

        // Enter para fazer login
        [emailInput, passwordInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loginBtn.click();
                }
            });
        });
    }

    async loginWithEmailPassword(email, password) {
        const loginBtn = document.getElementById('login-btn');
        const loginText = loginBtn.querySelector('.login-text');
        const loginSpinner = loginBtn.querySelector('.login-spinner');
        
        try {
            // Mostrar loading
            loginBtn.disabled = true;
            loginText.style.display = 'none';
            loginSpinner.style.display = 'inline';
            
            // Verificar se o email é de admin antes de verificar a senha
            const isAdmin = await this.checkIfUserIsAdmin(email);
            if (!isAdmin) {
                throw new Error('Email não autorizado para acesso administrativo');
            }
            
            await this.auth.signInWithEmailAndPassword(email, password);
            
            this.showLoginMessage('Login realizado com sucesso! Redirecionando...', 'success');
            
            // Aguardar um pouco antes de mostrar o painel
            setTimeout(() => {
                this.showAdminPanel();
            }, 1000);
            
        } catch (error) {
            console.error('Erro no login:', error);
            
            let errorMessage = 'Erro ao fazer login';
            
            if (error.message === 'Email não autorizado para acesso administrativo') {
                errorMessage = 'Este email não tem permissão para acessar o painel administrativo';
            } else {
                switch (error.code) {
                    case 'auth/invalid-email':
                        errorMessage = 'Email inválido';
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-login-credentials':
                        errorMessage = 'Email ou senha incorretos';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = 'Muitas tentativas. Tente novamente mais tarde';
                        break;
                    case 'auth/weak-password':
                        errorMessage = 'Senha muito fraca';
                        break;
                    default:
                        errorMessage = error.message;
                }
            }
            
            this.showLoginMessage(errorMessage, 'error');
            
        } finally {
            // Esconder loading
            loginBtn.disabled = false;
            loginText.style.display = 'inline';
            loginSpinner.style.display = 'none';
        }
    }

    showLoginMessage(message, type) {
        const messageDiv = document.getElementById('login-message');
        if (messageDiv) {
            messageDiv.textContent = message;
            messageDiv.className = `login-message ${type}`;
            messageDiv.style.display = 'block';
            
            if (type === 'success') {
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 3000);
            }
        }
    }

    showUnauthorizedMessage() {
        document.body.innerHTML = `
            <div class="bg-raffle">
                <div class="overlay">
                    <div class="login-container">
                        <div class="login-card glass-effect">
                            <div class="login-header">
                                <h1 class="login-title">🚫 Acesso Negado</h1>
                                <p class="login-subtitle">Você não tem permissão para acessar esta área</p>
                            </div>
                            
                            <div class="unauthorized-message">
                                <p>Apenas administradores autorizados podem acessar o painel administrativo.</p>
                                <p>Se você acredita que isso é um erro, entre em contato com a equipe.</p>
                            </div>
                            
                            <div class="login-footer">
                                <a href="index.html" class="back-link">← Voltar ao Site</a>
                                <button onclick="firebase.auth().signOut()" class="btn-logout">Sair</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .unauthorized-message {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.8);
                    font-family: 'Orbitron', monospace;
                    line-height: 1.6;
                    margin: 2rem 0;
                }
                
                .btn-logout {
                    margin-left: 1rem;
                    padding: 0.5rem 1rem;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid rgba(239, 68, 68, 0.5);
                    color: #ef4444;
                    border-radius: 6px;
                    cursor: pointer;
                    font-family: 'Orbitron', monospace;
                    font-size: 0.875rem;
                    transition: all 0.3s;
                }
                
                .btn-logout:hover {
                    background: rgba(239, 68, 68, 0.3);
                }
            </style>
        `;
    }

    showAdminPanel() {
        // Restaurar o conteúdo original e mostrar o painel admin
        if (this.originalContent) {
            document.body.innerHTML = this.originalContent;
            
            // Mostrar o conteúdo admin
            const adminContent = document.getElementById('admin-content');
            if (adminContent) {
                adminContent.classList.add('authenticated');
                adminContent.style.display = 'block';
            }

            const sorteioLink = document.getElementById('sorteioLink');
            if (sorteioLink) {
                sorteioLink.style.display = 'flex';
            }
            
            // Inicializar o painel admin se necessário
            this.initializeAdminPanel();
        } else {
            // Fallback: recarregar a página apenas se não tiver o conteúdo original
            console.log('Conteúdo original não encontrado, recarregando...');
            window.location.reload();
        }
    }

    async initializeAdminPanel() {
        try {
            // Aguardar um pouco para garantir que o DOM foi restaurado
            setTimeout(() => {
                if (!window.adminPanel && window.AdminPanel) {
                    window.adminPanel = new window.AdminPanel();
                } else if (!window.adminPanel) {
                    console.error('AdminPanel ainda nao esta disponivel.');
                }
            }, 500);
        } catch (error) {
            console.error('Erro ao inicializar painel admin:', error);
        }
    }

    async logout() {
        try {
            await this.auth.signOut();
            this.isAuthenticated = false;
            this.currentUser = null;
            window.adminPanel = null;
            this.showLoginForm();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    }

    // Método para adicionar novos administradores (apenas para super admins)
    async addAdmin(email) {
        try {
            const adminConfigRef = this.db.collection('config').doc('admins');
            const adminConfigDoc = await adminConfigRef.get();
            
            if (adminConfigDoc.exists) {
                const currentEmails = adminConfigDoc.data().emails || [];
                if (!currentEmails.includes(email.toLowerCase())) {
                    currentEmails.push(email.toLowerCase());
                    
                    await adminConfigRef.update({
                        emails: currentEmails,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    console.log(`Admin adicionado: ${email}`);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Erro ao adicionar admin:', error);
            throw error;
        }
    }
}

// Instância global
window.adminAuth = new AdminAuth();

// Função global para adicionar admins (usar no console)
window.addAdminEmail = async function(email) {
    try {
        await window.adminAuth.addAdmin(email);
        console.log(`✅ Email ${email} adicionado como administrador`);
    } catch (error) {
        console.error(`❌ Erro ao adicionar admin ${email}:`, error);
    }
};
