// Dados da equipe. Troque os placeholders antes de publicar.
const JAMBU_SORTEIO_CONFIG = {
    raffleName: 'Rifa Jambu Racing',
    prizeName: 'INSERIR PREMIO AQUI',
    whatsappNumber: 'INSERIR_NUMERO_WHATSAPP_AQUI'
};

// Gerenciador do Sorteio
class SorteioManager {
    constructor() {
        this.numerosSorteados = [];
        this.numerosVendidos = [];
        this.sorteadosSession = []; // numeros sorteados nesta sessão (reseta ao recarregar a página)
        this.participantes = new Map();
        this.sorteandoAtivo = false;
        this.numeroGanhador = null;
        this.ganhadorInfo = null;
        
        this.init();
    }

    async init() {
        try {
            console.log('Iniciando SorteioManager...');
            
            // Inicializar Firebase
            this.db = firebase.firestore();
            
            // Carregar números vendidos
            await this.carregarNumerosVendidos();
            
            // Atualizar display
            this.atualizarEstatisticas();
            this.renderizarNumerosParticipantes();
            
            console.log('SorteioManager inicializado com sucesso');
        } catch (error) {
            console.error('Erro ao inicializar SorteioManager:', error);
            this.mostrarToast('Erro ao conectar com o banco de dados', 'error');
        }
    }

    async carregarNumerosVendidos() {
        try {
            const snapshot = await this.db.collection('raffleNumbers').get();
            this.numerosVendidos = [];
            this.participantes.clear();

            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status === 'sold' && data.buyerInfo) {
                    this.numerosVendidos.push(data.number);
                    this.participantes.set(data.number, {
                        nome: `${data.buyerInfo.firstName} ${data.buyerInfo.lastName}`,
                        telefone: data.buyerInfo.phone || 'Não informado',
                        email: data.buyerInfo.email || 'Não informado'
                    });
                }
            });

            this.numerosVendidos.sort((a, b) => a - b);
            console.log(`Carregados ${this.numerosVendidos.length} números vendidos`);
        } catch (error) {
            console.error('Erro ao carregar números vendidos:', error);
            throw error;
        }
    }

    atualizarEstatisticas() {
        const totalVendidos = this.numerosVendidos.length;
        const totalParticipantes = this.participantes.size;
        const totalArrecadado = totalVendidos * 15;

        document.getElementById('total-sold').textContent = totalVendidos;
        document.getElementById('total-participants').textContent = totalParticipantes;
        document.getElementById('total-revenue').textContent = `R$ ${totalArrecadado.toFixed(2)}`;
    }

    renderizarNumerosParticipantes() {
        const container = document.getElementById('numeros-participantes');
        const countElement = document.getElementById('participantes-count');
        
        if (this.numerosVendidos.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 2rem;">Nenhum número vendido ainda</div>';
            countElement.textContent = 'Nenhum número vendido ainda';
            return;
        }

        countElement.textContent = `${this.numerosVendidos.length} números participando do sorteio`;
        
        container.innerHTML = '';
        this.numerosVendidos.forEach(numero => {
            const elemento = document.createElement('div');
            elemento.className = 'numero-participante';
            elemento.textContent = numero;
            elemento.title = `Número ${numero} - ${this.participantes.get(numero)?.nome || 'Participante'}`;
            container.appendChild(elemento);
        });
    }

    async iniciarSorteio() {
        if (this.sorteandoAtivo) return;
        
        if (this.numerosVendidos.length === 0) {
            this.mostrarToast('Nenhum número vendido para sortear!', 'error');
            return;
        }

        this.sorteandoAtivo = true;
        const btnSortear = document.getElementById('btn-sortear');
        const btnReset = document.getElementById('btn-reset');
        const winnerNumber = document.getElementById('winner-number');

        // Atualizar botões
        btnSortear.textContent = '🎲 SORTEANDO...';
        btnSortear.classList.add('loading');
        btnSortear.disabled = true;
        btnReset.style.display = 'none';

        // Iniciar animação de sorteio
        winnerNumber.classList.add('animating');
        
        // Criar efeito de partículas
        this.criarParticulas();

        // Animação de números girando
        let contador = 0;
        const duracaoSorteio = 3000; // 3 segundos
        const intervalos = 50; // Atualizar a cada 50ms
        const totalIntervalos = duracaoSorteio / intervalos;

        const intervalo = setInterval(() => {
            // Mostrar número aleatório
            const numeroAleatorio = this.numerosVendidos[Math.floor(Math.random() * this.numerosVendidos.length)];
            winnerNumber.textContent = numeroAleatorio;

            // Destacar número na grade
            this.destacarNumero(numeroAleatorio);

            contador++;
            
            if (contador >= totalIntervalos) {
                clearInterval(intervalo);
                this.finalizarSorteio();
            }
        }, intervalos);
    }

    destacarNumero(numero) {
        // Remove destaque anterior
        document.querySelectorAll('.numero-participante.highlight').forEach(el => {
            el.classList.remove('highlight');
        });

        // Adiciona destaque ao número atual
        document.querySelectorAll('.numero-participante').forEach(el => {
            if (parseInt(el.textContent) === numero) {
                el.classList.add('highlight');
            }
        });
    }

    finalizarSorteio() {
        const winnerNumber = document.getElementById('winner-number');
        const btnSortear = document.getElementById('btn-sortear');
        const btnReset = document.getElementById('btn-reset');

        // Sortear número final
        // Escolher número garantindo que não seja repetido dentro da sessão (quando possível)
        if (!this.numerosVendidos || this.numerosVendidos.length === 0) {
            this.numeroGanhador = null;
        } else {
            let attempts = 0;
            let candidate = this.numerosVendidos[Math.floor(Math.random() * this.numerosVendidos.length)];
            while (this.sorteadosSession.includes(candidate) && attempts < 200 && this.sorteadosSession.length < Math.min(20, this.numerosVendidos.length)) {
                candidate = this.numerosVendidos[Math.floor(Math.random() * this.numerosVendidos.length)];
                attempts++;
            }
            this.numeroGanhador = candidate;
        }
        // Registrar no array de sessão (até 20)
        if (this.numeroGanhador != null && !this.sorteadosSession.includes(this.numeroGanhador) && this.sorteadosSession.length < 20) {
            this.sorteadosSession.push(this.numeroGanhador);
            this.renderSorteadosList();
        }
        this.ganhadorInfo = this.participantes.get(this.numeroGanhador);

        // Atualizar display
        winnerNumber.textContent = this.numeroGanhador;
        winnerNumber.classList.remove('animating');
        winnerNumber.classList.add('winner');

        // Marcar número ganhador na grade
        this.marcarGanhador(this.numeroGanhador);

        // Mostrar informações do ganhador
        this.mostrarInfoGanhador();

        // Atualizar botões
        btnSortear.style.display = 'none';
        btnReset.style.display = 'inline-block';

        // Efeitos visuais
        this.criarConfete();
        this.mostrarToast(`Parabéns! O número ganhador é ${this.numeroGanhador}!`, 'success');

        // Mostrar modal de resultado após um tempo
        setTimeout(() => {
            this.mostrarModalResultado();
        }, 2000);

        this.sorteandoAtivo = false;
    }

    // Alterna visibilidade do painel de 20 sorteados
    toggleSorteadosPanel() {
        const panel = document.getElementById('sorteados-panel');
        if (!panel) return;
        panel.classList.toggle('active');
        // renderizar conteúdo sempre que abrir
        if (panel.classList.contains('active')) this.renderSorteadosList();
    }

    // Renderiza a lista de números sorteados na sessão
    renderSorteadosList() {
        const listContainer = document.getElementById('sorteados-list');
        const countEl = document.getElementById('sorteados-count');
        if (!listContainer || !countEl) return;

        countEl.textContent = `${this.sorteadosSession.length} / 20`;

        if (this.sorteadosSession.length === 0) {
            listContainer.innerHTML = '<div class="empty">Nenhum número sorteado ainda nesta sessão.</div>';
            return;
        }

        // Mostrar em ordem de sorteio
        listContainer.innerHTML = this.sorteadosSession.map((n, i) => `
            <div class="sorteado-item">
                <span class="index">${i + 1}.</span>
                <span class="number">${n}</span>
            </div>
        `).join('');
    }

    // Limpa a lista de sorteados da sessão (opcional)
    clearSorteadosSession() {
        this.sorteadosSession = [];
        this.renderSorteadosList();
        this.mostrarToast('Lista de sorteados da sessão limpa!', 'success');
    }

    marcarGanhador(numero) {
        document.querySelectorAll('.numero-participante').forEach(el => {
            el.classList.remove('highlight');
            if (parseInt(el.textContent) === numero) {
                el.classList.add('winner');
            }
        });
    }

    mostrarInfoGanhador() {
        const winnerInfo = document.getElementById('winner-info');
        const winnerName = document.getElementById('winner-name');
        const winnerPhone = document.getElementById('winner-phone');

        if (this.ganhadorInfo) {
            winnerName.textContent = this.ganhadorInfo.nome;
            winnerPhone.textContent = this.ganhadorInfo.telefone;
            winnerInfo.style.display = 'block';
        }
    }

    mostrarModalResultado() {
        const modal = document.getElementById('resultado-modal');
        const modalContent = document.getElementById('modal-content');

        const whatsappMessage = encodeURIComponent(
            `🎉 RESULTADO DO SORTEIO - ${JAMBU_SORTEIO_CONFIG.raffleName.toUpperCase()} 🎉\n\n` +
            `🏆 NÚMERO GANHADOR: ${this.numeroGanhador}\n` +
            `👤 GANHADOR: ${this.ganhadorInfo?.nome || 'Não informado'}\n` +
            `📱 CONTATO: ${this.ganhadorInfo?.telefone || 'Não informado'}\n\n` +
            `Parabéns ao ganhador do ${JAMBU_SORTEIO_CONFIG.prizeName}! 🌟`
        );

        modalContent.innerHTML = `
            <div class="resultado-content">
                <div class="resultado-numero">${this.numeroGanhador}</div>
                
                <div class="resultado-ganhador">
                    <div class="ganhador-nome">${this.ganhadorInfo?.nome || 'Participante'}</div>
                    <div class="ganhador-contato">${this.ganhadorInfo?.telefone || 'Contato não informado'}</div>
                </div>

                <p style="color: #d1d5db; margin: 1.5rem 0;">
                    Parabéns ao ganhador do <strong>${JAMBU_SORTEIO_CONFIG.prizeName}</strong>!<br>
                    Entre em contato para combinar a entrega do prêmio.
                </p>

                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem;">
                    <button class="btn-compartilhar" onclick="window.open('https://wa.me/${JAMBU_SORTEIO_CONFIG.whatsappNumber}?text=${whatsappMessage}', '_blank')">
                        📱 Compartilhar no WhatsApp
                    </button>
                    <button class="btn-compartilhar" onclick="sorteioManager.copiarResultado()">
                        📋 Copiar Resultado
                    </button>
                </div>
            </div>
        `;

        modal.classList.add('active');
    }

    copiarResultado() {
        const texto = `🎉 RESULTADO DO SORTEIO - ${JAMBU_SORTEIO_CONFIG.raffleName.toUpperCase()} 🎉\n\n` +
                     `🏆 NÚMERO GANHADOR: ${this.numeroGanhador}\n` +
                     `👤 GANHADOR: ${this.ganhadorInfo?.nome || 'Não informado'}\n` +
                     `📱 CONTATO: ${this.ganhadorInfo?.telefone || 'Não informado'}\n\n` +
                     `Parabéns ao ganhador do ${JAMBU_SORTEIO_CONFIG.prizeName}! 🌟`;

        navigator.clipboard.writeText(texto).then(() => {
            this.mostrarToast('Resultado copiado para a área de transferência!', 'success');
        }).catch(() => {
            // Fallback para navegadores mais antigos
            const textArea = document.createElement('textarea');
            textArea.value = texto;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.mostrarToast('Resultado copiado!', 'success');
        });
    }

    resetarSorteio() {
        const winnerNumber = document.getElementById('winner-number');
        const winnerInfo = document.getElementById('winner-info');
        const btnSortear = document.getElementById('btn-sortear');
        const btnReset = document.getElementById('btn-reset');

        // Reset do display
        winnerNumber.textContent = '?';
        winnerNumber.classList.remove('winner', 'animating');
        winnerInfo.style.display = 'none';

        // Reset dos botões
        btnSortear.textContent = '🎲 REALIZAR SORTEIO';
        btnSortear.classList.remove('loading');
        btnSortear.disabled = false;
        btnSortear.style.display = 'inline-block';
        btnReset.style.display = 'none';

        // Reset da grade de números
        document.querySelectorAll('.numero-participante').forEach(el => {
            el.classList.remove('highlight', 'winner');
        });

        // Limpar partículas e confete
        this.limparEfeitos();

        // Reset das variáveis
        this.numeroGanhador = null;
        this.ganhadorInfo = null;
        this.sorteandoAtivo = false;

        this.mostrarToast('Sorteio resetado! Pronto para um novo sorteio.', 'success');
    }

    fecharModal() {
        document.getElementById('resultado-modal').classList.remove('active');
    }

    criarParticulas() {
        const particlesContainer = document.createElement('div');
        particlesContainer.className = 'particles';
        document.body.appendChild(particlesContainer);

        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 4 + 's';
            particle.style.animationDuration = (Math.random() * 3 + 2) + 's';
            particlesContainer.appendChild(particle);
        }

        // Remover partículas após a animação
        setTimeout(() => {
            if (particlesContainer.parentNode) {
                particlesContainer.parentNode.removeChild(particlesContainer);
            }
        }, 5000);
    }

    criarConfete() {
        const cores = ['#10b981', '#fbbf24', '#3b82f6', '#ef4444', '#8b5cf6'];
        
        for (let i = 0; i < 100; i++) {
            const confete = document.createElement('div');
            confete.className = 'confetti';
            confete.style.left = Math.random() * 100 + '%';
            confete.style.backgroundColor = cores[Math.floor(Math.random() * cores.length)];
            confete.style.animationDelay = Math.random() * 3 + 's';
            confete.style.animationDuration = (Math.random() * 2 + 2) + 's';
            document.body.appendChild(confete);

            // Remover confete após a animação
            setTimeout(() => {
                if (confete.parentNode) {
                    confete.parentNode.removeChild(confete);
                }
            }, 5000);
        }
    }

    limparEfeitos() {
        // Remover partículas
        document.querySelectorAll('.particles').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        // Remover confete
        document.querySelectorAll('.confetti').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    mostrarToast(mensagem, tipo = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        
        toast.innerHTML = `
            <div class="toast-title">${tipo === 'success' ? 'Sucesso!' : 'Atenção!'}</div>
            <div class="toast-message">${mensagem}</div>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
    }
}

// Inicializar quando a página carregar
let sorteioManager;

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, inicializando SorteioManager...');
    sorteioManager = new SorteioManager();
});

// Fechar modal clicando fora
document.addEventListener('click', (e) => {
    if (e.target.id === 'resultado-modal') {
        sorteioManager.fecharModal();
    }
});

// Prevenir context menu nos números
document.addEventListener('contextmenu', (e) => {
    if (e.target.classList.contains('numero-participante')) {
        e.preventDefault();
    }
});
