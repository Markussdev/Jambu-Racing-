// Sistema de Autenticacao para Admin via Supabase Auth
class AdminAuth {
    constructor() {
        this.client = supabaseClient;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.originalContent = null;
        this.init();
    }

    async init() {
        if (document.body.innerHTML && !this.originalContent) {
            this.originalContent = document.body.innerHTML;
        }

        const { data, error } = await this.client.auth.getUser();

        if (error || !data?.user) {
            this.showLoginForm();
            return;
        }

        const isAdmin = await this.checkIfUserIsAdmin(data.user.email);

        if (!isAdmin) {
            await this.client.auth.signOut();
            this.showUnauthorizedMessage();
            return;
        }

        this.isAuthenticated = true;
        this.currentUser = data.user;
        this.showAdminPanel();
    }

    async checkIfUserIsAdmin(email) {
        if (!email) return false;

        try {
            const { data, error } = await this.client
                .from('admin_users')
                .select('email')
                .ilike('email', email)
                .maybeSingle();

            if (error) {
                console.error('Erro ao verificar admin:', error);
                return false;
            }

            return !!data;
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
                                <h1 class="login-title">Acesso Administrativo</h1>
                                <p class="login-subtitle">Rifa Jambu Racing</p>
                            </div>

                            <div class="login-form">
                                <div class="form-group">
                                    <label for="admin-email">Email do Administrador</label>
                                    <input type="email" id="admin-email" placeholder="seu@email.com" required>
                                </div>

                                <div class="form-group">
                                    <label for="admin-password">Senha</label>
                                    <input type="password" id="admin-password" placeholder="********" required>
                                    <div class="password-hint">
                                        Acesso restrito a equipe autorizada
                                    </div>
                                </div>

                                <button id="login-btn" class="btn-login">
                                    <span class="login-text">Entrar no Admin</span>
                                    <span class="login-spinner" style="display: none;">...</span>
                                </button>

                                <div class="login-footer">
                                    <a href="index.html" class="back-link">Voltar ao Site</a>
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
                    box-sizing: border-box;
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
                    margin-bottom: 1rem;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                }

                .btn-login:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
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
            </style>
        `;

        this.setupLoginEventListeners();
    }

    setupLoginEventListeners() {
        const loginBtn = document.getElementById('login-btn');
        const emailInput = document.getElementById('admin-email');
        const passwordInput = document.getElementById('admin-password');

        loginBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) {
                this.showLoginMessage('Por favor, preencha todos os campos', 'error');
                return;
            }

            await this.loginWithEmailPassword(email, password);
        });

        [emailInput, passwordInput].forEach(input => {
            input.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
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
            loginBtn.disabled = true;
            loginText.style.display = 'none';
            loginSpinner.style.display = 'inline';

            const { data, error } = await this.client.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            const isAdmin = await this.checkIfUserIsAdmin(data.user.email);

            if (!isAdmin) {
                await this.client.auth.signOut();
                throw new Error('Email nao autorizado para acesso administrativo');
            }

            this.isAuthenticated = true;
            this.currentUser = data.user;

            this.showLoginMessage('Login realizado com sucesso!', 'success');

            setTimeout(() => {
                this.showAdminPanel();
            }, 500);
        } catch (error) {
            console.error('Erro no login:', error);

            let errorMessage = 'Erro ao fazer login';

            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Email ou senha incorretos';
            } else if (error.message.includes('Email nao autorizado')) {
                errorMessage = 'Este email nao tem permissao para acessar o painel administrativo';
            } else {
                errorMessage = error.message;
            }

            this.showLoginMessage(errorMessage, 'error');
        } finally {
            loginBtn.disabled = false;
            loginText.style.display = 'inline';
            loginSpinner.style.display = 'none';
        }
    }

    showLoginMessage(message, type) {
        const messageDiv = document.getElementById('login-message');

        if (!messageDiv) return;

        messageDiv.textContent = message;
        messageDiv.className = `login-message ${type}`;
        messageDiv.style.display = 'block';
    }

    showUnauthorizedMessage() {
        document.body.innerHTML = `
            <div class="bg-raffle">
                <div class="overlay">
                    <div class="login-container">
                        <div class="login-card glass-effect">
                            <div class="login-header">
                                <h1 class="login-title">Acesso Negado</h1>
                                <p class="login-subtitle">Voce nao tem permissao para acessar esta area</p>
                            </div>

                            <div class="unauthorized-message">
                                <p>Apenas administradores autorizados podem acessar o painel administrativo.</p>
                            </div>

                            <div class="login-footer">
                                <a href="index.html" class="back-link">Voltar ao Site</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    showAdminPanel() {
        if (!this.originalContent) {
            window.location.reload();
            return;
        }

        document.body.innerHTML = this.originalContent;

        const adminContent = document.getElementById('admin-content');
        if (adminContent) {
            adminContent.classList.add('authenticated');
            adminContent.style.display = 'block';
        }

        const sorteioLink = document.getElementById('sorteioLink');
        if (sorteioLink) {
            sorteioLink.style.display = 'flex';
        }

        this.initializeAdminPanel();
    }

    initializeAdminPanel() {
        setTimeout(() => {
            if (!window.adminPanel && window.AdminPanel) {
                window.adminPanel = new window.AdminPanel();
            } else if (!window.AdminPanel) {
                console.error('AdminPanel ainda nao esta disponivel.');
            }
        }, 300);
    }

    async logout() {
        try {
            await this.client.auth.signOut();

            this.isAuthenticated = false;
            this.currentUser = null;
            window.adminPanel = null;

            this.showLoginForm();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    }
}

window.adminAuth = new AdminAuth();
