(() => {
    'use strict';

    const recoveryUrl = new URL(window.location.href);
    const recoveryFragment = new URLSearchParams(recoveryUrl.hash.slice(1));
    const recoveryToken = recoveryFragment.get('token') || recoveryUrl.searchParams.get('token') || '';
    if (recoveryFragment.has('token') || recoveryUrl.searchParams.has('token')) {
        recoveryFragment.delete('token');
        recoveryUrl.searchParams.delete('token');
        recoveryUrl.hash = recoveryFragment.toString();
        window.history.replaceState(null, '', recoveryUrl.pathname + recoveryUrl.search + recoveryUrl.hash);
    }

    const bootstrap = window.BARBERSHOP_BOOTSTRAP || { view: 'login' };
    const app = document.getElementById('app');
    const routes = ['login', 'forgot', 'home', 'agenda', 'clients', 'team', 'services', 'account', 'booking', 'history', 'platform', 'reset'];
    const roleLabels = { admin: 'administrador da barbearia', barber: 'barbeiro', client: 'cliente' };
    const statusLabels = {
        pending: 'Pendente',
        confirmed: 'Confirmado',
        completed: 'Concluído',
        cancelled: 'Cancelado',
        no_show: 'Não compareceu'
    };
    const subscriptionStatusLabels = {
        trialing: 'Em teste', active: 'Pagando', past_due: 'Inadimplente', paused: 'Pausada', canceled: 'Cancelada', expired: 'Vencida', without_subscription: 'Sem assinatura'
    };
    const errorLabels = {
        invalid_credentials: 'E-mail ou senha inválidos.',
        unauthorized: 'Sua sessão expirou. Entre novamente.',
        forbidden: 'Você não tem permissão para esta ação.',
        csrf_invalid: 'A página precisa ser atualizada antes de salvar.',
        rate_limited: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
        invalid_current_password: 'Informe a senha atual da sua conta.',
        current_password_invalid: 'A senha atual está incorreta.',
        invalid_reset_token: 'O link de recuperação expirou ou já foi usado. Solicite outro link.',
        password_confirmation_mismatch: 'A confirmação não corresponde à nova senha.',
        invalid_user: 'Confira os dados do usuário.',
        invalid_password: 'A senha precisa ter entre 8 e 4096 caracteres.',
        email_already_exists: 'Já existe uma conta com este e-mail.',
        user_not_found: 'Usuário não encontrado.',
        admin_record_restricted: 'Contas de administrador não podem ser editadas aqui.',
        invalid_service: 'Confira nome, duração, valor e descrição do serviço.',
        service_not_found: 'Serviço não encontrado ou inativo.',
        invalid_appointment: 'Confira os dados do atendimento.',
        invalid_appointment_time: 'Escolha um horário disponível.',
        appointment_must_be_future: 'O atendimento precisa ser no futuro.',
        appointment_outside_hours: 'O horário deve ficar entre 09:00 e 18:00.',
        appointment_duration_mismatch: 'A duração do horário não corresponde ao serviço.',
        appointment_conflict: 'Este horário acabou de ser ocupado. Escolha outro.',
        client_appointment_conflict: 'O cliente já tem um atendimento neste intervalo.',
        client_not_found: 'Cliente não encontrado ou inativo.',
        barber_not_found: 'Barbeiro não encontrado ou inativo.',
        appointment_not_found: 'Atendimento não encontrado ou sem permissão.',
        invalid_status_transition: 'Essa mudança de status não é permitida.',
        invalid_availability: 'Não foi possível consultar os horários.',
        invalid_date: 'Data inválida.',
        invalid_search: 'Busca muito longa.',
        database_unavailable: 'O serviço está temporariamente indisponível.',
        internal_error: 'Não foi possível concluir a operação agora.',
        not_found: 'Recurso não encontrado.',
        not_installed: 'O serviço ainda não está disponível.',
        billing_not_ready: 'A estrutura comercial ainda não foi ativada no banco de dados.',
        invalid_plan: 'Confira nome, código, preço, periodicidade e teste do plano.',
        plan_code_exists: 'Já existe um plano com esse código.',
        invalid_platform_customer: 'Confira os dados da barbearia, do responsável e uma senha com pelo menos 8 caracteres.',
        invalid_checkout_request: 'Informe a barbearia, o plano e um e-mail válido para o checkout.',
        barbershop_not_found: 'Barbearia não encontrada.',
        payment_not_configured: 'O pagamento ainda não está configurado no servidor.',
        payment_provider_error: 'O provedor de pagamento não aceitou o checkout agora.',
        csrf_unavailable: 'Não foi possível iniciar a proteção da sessão.'
    };
    const serviceReferences = [
        ['Corte Máquina', 3500],
        ['Corte Tesoura', 4000],
        ['Corte Navalhado', 4000],
        ['Barba Terapia', 4000],
        ['Barba', 3000],
        ['Reflexo', 10000],
        ['Nevou', 12000]
    ];

    class ApiError extends Error {
        constructor(code, status, message) {
            super(message || code);
            this.name = 'ApiError';
            this.code = code;
            this.status = status;
        }
    }

    const state = {
        view: routes.includes(String(bootstrap.view)) ? String(bootstrap.view) : 'login',
        user: null,
        csrf: null,
        resetToken: recoveryToken,
        agendaDate: saoPauloToday(),
        editingUser: null,
        editingService: null,
        platformSection: 'overview',
        platformCustomerFilter: 'all',
        renderId: 0,
        toastTimer: null
    };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'className') node.className = value;
            else if (key === 'text') node.textContent = String(value);
            else if (key === 'htmlFor') node.htmlFor = value;
            else if (key === 'dataset' && value && typeof value === 'object') {
                Object.entries(value).forEach(([dataKey, dataValue]) => { node.dataset[dataKey] = String(dataValue); });
            } else if (key.startsWith('on') && typeof value === 'function') {
                node.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key === 'checked' || key === 'selected' || key === 'multiple') {
                node[key] = Boolean(value);
            } else if (key === 'disabled' || key === 'required' || key === 'hidden') {
                node[key] = Boolean(value);
            } else {
                node.setAttribute(key, String(value));
            }
        });
        const list = Array.isArray(children) ? children : [children];
        list.flat(Infinity).forEach((child) => {
            if (child === null || child === undefined || child === false) return;
            node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        });
        return node;
    }

    function clear(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
        return node;
    }

    function text(value) {
        return document.createTextNode(value === null || value === undefined ? '' : String(value));
    }

    function saoPauloToday() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function shiftDate(value, days) {
        const parts = String(value).split('-').map(Number);
        if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return saoPauloToday();
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
        return date.toISOString().slice(0, 10);
    }

    function displayDate(value, long = false) {
        const parts = String(value || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return 'Data não informada';
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return new Intl.DateTimeFormat('pt-BR', long ? { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
    }

    function dateFromApi(value) {
        const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        return match ? { date: match[1], time: match[2] } : { date: '', time: '' };
    }

    function formatApiDateTime(value) {
        const parsed = dateFromApi(value);
        return parsed.date ? `${displayDate(parsed.date)} às ${parsed.time}` : 'Horário não informado';
    }

    function formatTime(value) {
        return dateFromApi(value).time || '—';
    }

    function formatBRL(cents) {
        if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'Valor não informado';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
    }

    function formatBRLInput(cents) {
        if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
        return (Number(cents) / 100).toFixed(2).replace('.', ',');
    }

    function parseBRLCents(value) {
        let raw = String(value || '').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
        if (!raw || raw.startsWith('-')) return null;
        if (raw.includes(',')) {
            const pieces = raw.split(',');
            if (pieces.length !== 2 || !/^\d+$/.test(pieces[0].replace(/\./g, '')) || !/^\d{1,2}$/.test(pieces[1])) return null;
            const whole = pieces[0].replace(/\./g, '');
            return Number(whole) * 100 + Number(pieces[1].padEnd(2, '0'));
        }
        if (/^\d+(\.\d{1,2})?$/.test(raw)) {
            const pieces = raw.split('.');
            if (pieces.length === 2) return Number(pieces[0]) * 100 + Number(pieces[1].padEnd(2, '0'));
            return Number(raw) * 100;
        }
        if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, '')) * 100;
        if (/^\d+$/.test(raw)) return Number(raw) * 100;
        return null;
    }

    function initials(name) {
        const words = String(name || '').trim().split(/\s+/).filter(Boolean);
        return (words.slice(0, 2).map((word) => word[0]).join('') || 'BH').toUpperCase();
    }

    function roleLabel(role) {
        return roleLabels[role] || String(role || 'usuário');
    }

    function statusPill(status) {
        return el('span', { className: `status ${status || ''}`, text: statusLabels[status] || status || 'Sem status' });
    }

    function button(label, className = 'button', handler = null) {
        const node = el('button', { type: 'button', className, text: label });
        if (handler) node.addEventListener('click', handler);
        return node;
    }

    function setButtonBusy(node, busy, busyLabel = 'Salvando...') {
        if (!node) return;
        if (busy) {
            node.dataset.originalLabel = node.textContent || '';
            node.textContent = busyLabel;
            node.disabled = true;
        } else {
            node.textContent = node.dataset.originalLabel || node.textContent || '';
            node.disabled = false;
        }
    }

    function friendlyError(error) {
        if (error instanceof ApiError && errorLabels[error.code]) return errorLabels[error.code];
        if (error instanceof ApiError && error.message && error.message !== error.code) return error.message;
        if (error && error.name === 'TypeError') return 'Não foi possível conectar ao serviço.';
        return 'Não foi possível concluir a operação agora.';
    }

    function showToast(message, type = 'success') {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = el('div', { id: 'toast', className: 'toast', role: 'status', 'aria-live': 'polite' });
            document.body.appendChild(toast);
        }
        toast.className = `toast${type === 'error' ? ' error' : ''}`;
        toast.textContent = message;
        toast.hidden = false;
        window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 5200);
    }

    function pageError(error, retry) {
        const node = el('div', { className: 'error-state', role: 'alert' }, [
            el('strong', { text: 'Não foi possível carregar esta área.' }),
            el('span', { text: friendlyError(error) })
        ]);
        if (retry) node.appendChild(el('div', { className: 'form-actions' }, [button('Tentar novamente', 'button ghost small', retry)]));
        return node;
    }

    function emptyState(title, description = '') {
        return el('div', { className: 'empty-state' }, [
            el('strong', { text: title }),
            description ? el('span', { text: description }) : null
        ]);
    }

    function field(labelText, input, hint = '') {
        const nestedInput = input.querySelector && input.querySelector('input');
        const id = input.id || (nestedInput ? nestedInput.id : '') || `field-${Math.random().toString(36).slice(2)}`;
        if (!input.id && !nestedInput) input.id = id;
        return el('div', { className: 'field' }, [
            el('label', { htmlFor: id, text: labelText }),
            input,
            hint ? el('div', { className: 'field-hint', text: hint }) : null
        ]);
    }

    function input(type, id, value = '', options = {}) {
        return el('input', Object.assign({ type, id, value }, options));
    }

    function passwordControl(id, options = {}) {
        const password = input('password', id, '', Object.assign({ autocomplete: 'off' }, options));
        const toggle = button('Mostrar senha', 'button ghost small', () => {
            const showing = password.type === 'text';
            password.type = showing ? 'password' : 'text';
            toggle.textContent = showing ? 'Mostrar senha' : 'Ocultar senha';
            toggle.setAttribute('aria-pressed', showing ? 'false' : 'true');
        });
        toggle.setAttribute('aria-controls', id);
        toggle.setAttribute('aria-pressed', 'false');
        return el('div', { className: 'password-control' }, [password, toggle]);
    }

    function selectInput(id, options = {}) {
        return el('select', Object.assign({ id }, options));
    }

    function addSelectOptions(select, items, placeholder, valueKey = 'id', labelKey = 'name') {
        clear(select);
        if (placeholder !== null) select.appendChild(el('option', { value: '', text: placeholder }));
        items.forEach((item) => {
            const option = el('option', { value: item[valueKey], text: item[labelKey] });
            if (item.selected) option.selected = true;
            select.appendChild(option);
        });
    }

    function navItems(role) {
        if (state.user && state.user.platform_admin) return [['platform', 'Plataforma', 'PL'], ['account', 'Conta', 'CT']];
        if (role === 'admin') return [
            ['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['clients', 'Clientes', 'CL'], ['services', 'Serviços', 'SV'], ['more', 'Mais', '…']
        ];
        if (role === 'barber') return [
            ['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['services', 'Serviços', 'SV'], ['account', 'Conta', 'CT'], ['more', 'Mais', '…']
        ];
        return [
            ['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['booking', 'Agendar', '＋'], ['history', 'Histórico', 'HI'], ['account', 'Conta', 'CT']
        ];
    }

    function desktopNavItems(role) {
        if (state.user && state.user.platform_admin) return [['platform', 'Plataforma', 'PL'], ['account', 'Conta', 'CT']];
        if (role === 'admin') return [
            ['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['clients', 'Clientes', 'CL'], ['team', 'Equipe', 'EQ'], ['services', 'Serviços', 'SV'], ['account', 'Conta', 'CT']
        ];
        if (role === 'barber') return [['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['services', 'Serviços', 'SV'], ['account', 'Conta', 'CT']];
        return [['home', 'Início', 'IN'], ['agenda', 'Agenda', 'AG'], ['booking', 'Agendar', '＋'], ['history', 'Histórico', 'HI'], ['account', 'Conta', 'CT']];
    }

    function navigate(view, replace = false) {
        const next = routes.includes(view) ? view : 'home';
        state.view = next;
        const url = new URL(window.location.href);
        url.searchParams.set('view', next);
        if (next !== 'reset') url.searchParams.delete('token');
        window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
        renderApp();
    }

    function renderNavItem(item, mobile = false) {
        const [view, label, symbol] = item;
        const isMore = view === 'more';
        const node = button('', mobile ? 'mobile-nav-item' : 'nav-item', () => {
            if (isMore) toggleMoreMenu(node);
            else navigate(view);
        });
        node.append(el('span', { className: 'nav-symbol', 'aria-hidden': 'true', text: symbol }), el('span', { className: 'nav-label', text: label }));
        if (!isMore && state.view === view) node.setAttribute('aria-current', 'page');
        if (isMore) node.setAttribute('aria-haspopup', 'menu');
        return node;
    }

    function toggleMoreMenu(anchor) {
        const old = document.getElementById('more-menu');
        if (old) { old.remove(); return; }
        const role = state.user ? state.user.role : 'client';
        const menu = el('div', { id: 'more-menu', className: 'more-menu', role: 'menu' }, [
            el('div', { className: 'more-menu-title', text: 'Mais opções' })
        ]);
        const options = role === 'admin'
            ? [['clients', 'Clientes', 'CL'], ['team', 'Equipe', 'EQ'], ['services', 'Serviços', 'SV'], ['account', 'Minha conta', 'CT']]
            : role === 'barber'
                ? [['services', 'Serviços', 'SV'], ['account', 'Minha conta', 'CT']]
                : [['account', 'Minha conta', 'CT']];
        options.forEach(([view, label, symbol]) => {
            const item = button('', 'more-menu-item', () => { menu.remove(); navigate(view); });
            item.append(el('span', { className: 'more-menu-symbol', text: symbol }), el('span', { text: label }));
            item.setAttribute('role', 'menuitem');
            menu.appendChild(item);
        });
        menu.appendChild(button('Fechar', 'button ghost small more-menu-close', () => menu.remove()));
        document.body.appendChild(menu);
        const close = (event) => {
            if (!menu.contains(event.target) && event.target !== anchor) {
                menu.remove();
                document.removeEventListener('click', close, true);
            }
        };
        window.setTimeout(() => document.addEventListener('click', close, true), 0);
    }

    function renderShell() {
        clear(app);
        app.className = 'app-shell';
        const user = state.user;
        const sidebar = el('aside', { className: 'sidebar' }, [
            el('a', { className: 'brand-lockup', href: '?view=home', 'aria-label': 'Ir para o início', onclick: (event) => { event.preventDefault(); navigate('home'); } }, [
                el('img', { src: 'assets/logo.png', width: 40, height: 40, alt: 'Logo Barber Shop' }),
                el('span', { text: 'Barber Shop\nSistemas HP' })
            ]),
            el('div', { className: 'sidebar-user' }, [
                el('div', { className: 'user-name', text: user.name }),
                el('div', { className: 'user-role', text: user.platform_admin ? 'administrador da plataforma' : roleLabel(user.role) })
            ]),
            el('nav', { className: 'nav-list', 'aria-label': 'Navegação principal' }, desktopNavItems(user.role).map((item) => renderNavItem(item))),
            el('div', { className: 'sidebar-footer', text: 'Agenda online • horário de São Paulo' })
        ]);
        const pageTitle = pageTitleFor(state.view, user.role);
        const topbar = el('header', { className: 'topbar' }, [
            el('div', { className: 'topbar-title' }, [
                el('div', { className: 'eyebrow', text: 'SISTEMAS HP' }),
                el('h1', { text: pageTitle })
            ]),
            el('div', { className: 'topbar-actions' }, [
                el('span', { className: 'user-role', text: user.name }),
                button('Sair', 'button secondary small', logout)
            ])
        ]);
        const content = el('main', { id: 'main-content', className: 'main-content', tabindex: '-1' });
        const mobileClass = user.platform_admin ? 'mobile-nav platform-mobile-nav' : 'mobile-nav';
        const mobile = el('nav', { className: mobileClass, 'aria-label': 'Navegação móvel' }, navItems(user.role).map((item) => renderNavItem(item, true)));
        const mainArea = el('div', { className: 'main-area' }, [topbar, content, mobile]);
        app.append(sidebar, mainArea);
        return content;
    }

    function pageTitleFor(view, role) {
        const titles = { home: 'Visão geral', platform: 'Painel da plataforma', agenda: 'Agenda', clients: 'Clientes', team: 'Equipe', services: 'Serviços', account: 'Minha conta', booking: 'Novo agendamento', history: 'Meu histórico', login: 'Entrar', forgot: 'Recuperar senha', reset: 'Redefinir senha' };
        if (view === 'home' && role === 'admin') return 'Dashboard';
        return titles[view] || 'Barber Shop';
    }

    function pageIntro(title, description, actions = []) {
        return el('div', { className: 'page-intro' }, [
            el('div', {}, [el('div', { className: 'eyebrow', text: 'BARBER SHOP' }), el('h2', { text: title }), el('p', { text: description })]),
            actions.length ? el('div', { className: 'page-actions' }, actions) : null
        ]);
    }

    async function api(action, options = {}) {
        const method = options.method || 'GET';
        const params = options.params || {};
        const query = new URLSearchParams({ action, ...params });
        const headers = { Accept: 'application/json' };
        const request = { method, credentials: 'same-origin', headers };
        if (method !== 'GET' && method !== 'HEAD') {
            headers['Content-Type'] = 'application/json';
            headers['X-CSRF-Token'] = state.csrf || '';
            request.body = JSON.stringify(options.body || {});
        }
        let response;
        try {
            response = await fetch(`web-api.php?${query.toString()}`, request);
        } catch (error) {
            throw error;
        }
        let payload = null;
        try { payload = await response.json(); } catch (_) { payload = {}; }
        if (typeof payload.csrf === 'string' && payload.csrf) state.csrf = payload.csrf;
        if (!response.ok || payload.ok === false) {
            throw new ApiError(payload.error || `http_${response.status}`, response.status, payload.message);
        }
        return payload;
    }

    async function loadSession() {
        const result = await api('session');
        state.user = result.user || null;
        state.csrf = typeof result.csrf === 'string' ? result.csrf : null;
    }

    async function logout() {
        try {
            await api('logout', { method: 'POST', body: {} });
        } catch (_) {
            // The local session is cleared even if the server is already unavailable.
        }
        state.user = null;
        state.editingUser = null;
        state.editingService = null;
        navigate('login', true);
        showToast('Sessão encerrada.');
    }

    function authBrand() {
        return el('section', { className: 'auth-brand' }, [
            el('img', { src: 'assets/logo.png', width: 120, height: 120, alt: 'Barber Shop Sistemas HP' }),
            el('div', { className: 'eyebrow', text: 'SISTEMAS HP' }),
            el('h1', { text: 'Sua agenda, no ritmo da barbearia.' }),
            el('p', { text: 'Agendamentos e operação em um só lugar, com os dados da sua conta.' })
        ]);
    }

    function authLink(label, view) {
        return button(label, 'button-link', () => navigate(view));
    }

    function renderAuth() {
        clear(app);
        app.className = 'auth-layout';
        const card = el('section', { className: 'auth-card' });
        if (state.view === 'reset') renderReset(card);
        else if (state.view === 'forgot') renderForgot(card);
        else renderLogin(card);
        app.append(el('div', { className: 'auth-wrap' }, [authBrand(), card]));
    }

    function renderLogin(card) {
        card.append(el('h2', { text: 'Entrar na conta' }), el('p', { className: 'subheading', text: 'Use o e-mail da sua conta Barber Shop.' }));
        const form = el('form', { className: 'auth-form', novalidate: true, autocomplete: 'off' });
        const email = input('email', 'login-email', '', { autocomplete: 'username', required: true, maxlength: 190, placeholder: 'voce@exemplo.com' });
        const password = passwordControl('login-password', { required: true, maxlength: 4096, placeholder: 'Sua senha' });
        const message = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
        const submit = button('Entrar', 'button block');
        submit.type = 'submit';
        form.append(field('E-mail', email), field('Senha', password), message, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity() || submit.disabled) return;
            setButtonBusy(submit, true, 'Entrando...');
            message.className = 'form-message';
            message.textContent = '';
            try {
                const result = await api('login', { method: 'POST', body: { email: email.value.trim(), password: password.querySelector('input').value } });
                state.user = result.user || null;
                if (!state.user) throw new ApiError('invalid_credentials', 401);
                navigate(defaultViewForRole(state.user.role), true);
            } catch (error) {
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            } finally {
                setButtonBusy(submit, false);
            }
        });
        card.append(form, el('div', { className: 'auth-links' }, [authLink('Esqueci minha senha', 'forgot')]));
    }

    function renderForgot(card) {
        card.append(el('h2', { text: 'Esqueci minha senha' }), el('p', { className: 'subheading', text: 'Informe seu e-mail. Se houver uma conta, enviaremos as instruções de recuperação.' }));
        const form = el('form', { className: 'auth-form', novalidate: true });
        const email = input('email', 'forgot-email', '', { autocomplete: 'email', required: true, maxlength: 190, placeholder: 'voce@exemplo.com' });
        const message = el('p', { className: 'form-message', role: 'status', 'aria-live': 'polite' });
        const submit = button('Enviar instruções', 'button block');
        submit.type = 'submit';
        form.append(field('E-mail', email), message, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity() || submit.disabled) return;
            setButtonBusy(submit, true, 'Enviando...');
            message.className = 'form-message';
            try {
                const result = await api('forgot_password', { method: 'POST', body: { email: email.value.trim() } });
                message.className = 'form-message success';
                message.textContent = result.message || 'Se houver uma conta, as instruções foram enviadas.';
            } catch (error) {
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            } finally {
                setButtonBusy(submit, false);
            }
        });
        card.append(form, el('div', { className: 'auth-links' }, [authLink('Voltar para entrar', 'login')]));
    }

    function renderReset(card) {
        const token = state.resetToken;
        card.append(el('h2', { text: 'Redefinir senha' }), el('p', { className: 'subheading', text: 'Escolha uma nova senha para sua conta.' }));
        if (!token) {
            card.append(el('div', { className: 'error-state', role: 'alert' }, [el('strong', { text: 'Link incompleto.' }), el('span', { text: 'Abra o link de recuperação recebido por e-mail.' })]), el('div', { className: 'auth-links' }, [authLink('Voltar para entrar', 'login')]));
            return;
        }
        const form = el('form', { className: 'auth-form', novalidate: true, autocomplete: 'off' });
        const password = passwordControl('reset-password', { required: true, minlength: 8, maxlength: 4096, placeholder: 'Mínimo de 8 caracteres' });
        const confirm = passwordControl('reset-confirm', { required: true, minlength: 8, maxlength: 4096, placeholder: 'Repita a nova senha' });
        const message = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
        const submit = button('Salvar nova senha', 'button block');
        submit.type = 'submit';
        form.append(field('Nova senha', password, 'Use pelo menos 8 caracteres.'), field('Confirmar nova senha', confirm), message, submit);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const passwordValue = password.querySelector('input').value;
            const confirmValue = confirm.querySelector('input').value;
            if (!form.reportValidity() || passwordValue !== confirmValue || submit.disabled) {
                if (passwordValue !== confirmValue) { message.className = 'form-message error'; message.textContent = 'As senhas não coincidem.'; }
                return;
            }
            setButtonBusy(submit, true, 'Salvando...');
            message.className = 'form-message';
            try {
                const result = await api('reset_password', { method: 'POST', body: { token, new_password: passwordValue, new_password_confirm: confirmValue } });
                state.resetToken = '';
                message.className = 'form-message success';
                message.textContent = result.message || 'Senha redefinida. Você já pode entrar.';
                window.setTimeout(() => navigate('login', true), 1100);
            } catch (error) {
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            } finally {
                setButtonBusy(submit, false);
            }
        });
        card.append(form, el('div', { className: 'auth-links' }, [authLink('Voltar para entrar', 'login')]));
    }

    function defaultViewForRole(role) {
        if (state.user && state.user.platform_admin) return 'platform';
        return role === 'client' ? 'home' : 'home';
    }

    async function renderAuthenticated() {
        const validViews = state.user.platform_admin ? ['platform', 'account'] : state.user.role === 'admin' ? ['home', 'agenda', 'clients', 'team', 'services', 'account'] : state.user.role === 'barber' ? ['home', 'agenda', 'services', 'account'] : ['home', 'agenda', 'booking', 'history', 'account'];
        if (!validViews.includes(state.view)) {
            state.view = 'home';
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'home');
            window.history.replaceState({}, '', url);
        }
        const content = renderShell();
        const renderId = ++state.renderId;
        content.setAttribute('aria-busy', 'true');
        try {
            await renderView(content, renderId);
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                state.user = null;
                navigate('login', true);
                showToast(friendlyError(error), 'error');
                return;
            }
            clear(content);
            content.append(pageError(error, () => renderApp()));
        } finally {
            if (content.isConnected) content.setAttribute('aria-busy', 'false');
        }
    }

    async function renderView(content, renderId) {
        if (state.view === 'platform') return renderPlatformPage(content);
        if (state.view === 'home') return renderHome(content);
        if (state.view === 'agenda') return renderAgenda(content);
        if (state.view === 'clients') return renderPeoplePage(content, 'client');
        if (state.view === 'team') return renderPeoplePage(content, 'barber');
        if (state.view === 'services') return renderServicesPage(content);
        if (state.view === 'account') return renderAccount(content);
        if (state.view === 'booking') return renderBookingPage(content, false);
        if (state.view === 'history') return renderHistory(content);
        if (renderId !== state.renderId) return null;
    }

    function renderApp() {
        if (!app) return;
        if (!state.user) renderAuth();
        else renderAuthenticated();
    }

    function statCard(label, value) {
        return el('div', { className: 'card stat-card' }, [el('div', { className: 'stat-label', text: label }), el('div', { className: 'stat-value', text: value === undefined || value === null ? '—' : value })]);
    }

    function subscriptionPill(status) {
        return el('span', { className: `status ${status || ''}`, text: subscriptionStatusLabels[status] || status || 'Sem status' });
    }

    function platformSectionTabs() {
        const sections = [['overview', 'Visão geral'], ['shops', 'Barbearias'], ['billing', 'Planos e pagamentos']];
        return el('nav', { className: 'platform-tabs', role: 'group', 'aria-label': 'Áreas administrativas da plataforma' }, sections.map(([id, label]) => {
            const active = state.platformSection === id;
            const control = button(label, 'platform-tab', () => {
                state.platformSection = id;
                renderApp();
            });
            control.setAttribute('aria-pressed', active ? 'true' : 'false');
            return control;
        }));
    }

    function formatUtcDateTime(value) {
        if (!value) return 'Sem data';
        const parsed = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'));
        if (Number.isNaN(parsed.getTime())) return String(value);
        return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(parsed);
    }

    async function renderPlatformPage(content) {
        const result = await api('platform_dashboard');
        const metrics = result.metrics || {};
        const upcoming = Array.isArray(result.upcoming) ? result.upcoming : [];
        const recentSignups = Array.isArray(result.recent_signups) ? result.recent_signups : [];
        if (!['overview', 'shops', 'billing'].includes(state.platformSection)) state.platformSection = 'overview';
        const sectionKey = state.platformSection;
        clear(content);
        content.append(pageIntro('Painel da plataforma', 'Gerencie sua plataforma SaaS, as barbearias e as assinaturas em áreas separadas.', [button('Atualizar dados', 'button secondary', () => renderApp())]));
        content.append(platformSectionTabs());
        content.append(el('div', { className: 'stats-grid platform-stats', hidden: sectionKey !== 'overview' }, [
            statCard('Barbearias cadastradas', metrics.barbershops),
            statCard('Assinaturas pagantes', metrics.active_subscriptions),
            statCard('Em teste', metrics.trialing),
            statCard('Inadimplentes', metrics.past_due),
            statCard('Testes vencidos', metrics.expired),
            statCard('Barbeiros ativos', metrics.active_barbers),
            statCard('Clientes cadastrados', metrics.total_clients),
            statCard('Clientes ativos', metrics.active_clients),
            statCard('Clientes inativos', metrics.inactive_clients)
        ]));
        const section = el('section', { className: 'card section-card platform-panel', hidden: sectionKey !== 'overview' }, [
            el('h3', { text: 'Atenção comercial' }),
            el('p', { className: 'section-description', text: 'Testes e assinaturas que precisam de acompanhamento.' })
        ]);
        if (!upcoming.length) {
            section.append(emptyState('Nenhuma assinatura pendente', 'Os dados aparecerão aqui quando houver testes ou cobranças em acompanhamento.'));
        } else {
            const list = el('div', { className: 'record-list' });
            upcoming.forEach((item) => {
                const deadline = item.status === 'trialing' ? item.trial_ends_at : item.current_period_end;
                list.appendChild(el('article', { className: 'record-row' }, [
                    el('div', { className: 'record-main' }, [
                        el('strong', { text: item.barbershop_name }),
                        el('span', { text: item.status === 'trialing' ? `Teste termina em ${formatUtcDateTime(deadline)}` : `Período atual até ${formatUtcDateTime(deadline)}` })
                    ]),
                    el('div', { className: 'record-secondary' }, [subscriptionPill(item.status), el('span', { text: item.plan_name || item.plan_code || 'Plano não definido' })])
                ]));
            });
            section.append(list);
        }
        content.append(section);

        const recentSection = el('section', { className: 'card section-card platform-panel', hidden: sectionKey !== 'overview' }, [
            el('h3', { text: 'Cadastros recentes' }),
            el('p', { className: 'section-description', text: 'Últimas barbearias adicionadas e situação atual da assinatura.' })
        ]);
        if (!recentSignups.length) {
            recentSection.append(emptyState('Nenhuma barbearia cadastrada', 'Os novos cadastros aparecerão aqui.'));
        } else {
            const recentList = el('div', { className: 'record-list' });
            recentSignups.forEach((item) => recentList.appendChild(el('article', { className: 'record-row' }, [
                el('div', { className: 'record-main' }, [
                    el('strong', { text: item.name }),
                    el('span', { text: `Cadastro em ${formatUtcDateTime(item.created_at)}` })
                ]),
                el('div', { className: 'record-secondary' }, [subscriptionPill(item.subscription_status)])
            ])));
            recentSection.append(recentList);
        }
        content.append(recentSection);

        const customersSection = el('section', { className: 'card section-card', hidden: sectionKey !== 'shops' }, [
            el('h3', { text: 'Clientes comerciais' }),
            el('p', { className: 'section-description', text: 'Barbearias cadastradas, plano, período, situação da assinatura e contatos.' })
        ]);
        try {
            const customerResult = await api('platform_customers');
            const customers = Array.isArray(customerResult.customers) ? customerResult.customers : [];
            if (!customers.length) {
                customersSection.append(emptyState('Nenhuma barbearia cadastrada', 'Cadastre o primeiro cliente comercial abaixo.'));
            } else {
                const filters = [['all', 'Todas'], ['active', 'Pagando'], ['trialing', 'Em teste'], ['attention', 'Precisa de atenção']];
                const filterBar = el('div', { className: 'filter-buttons', role: 'group', 'aria-label': 'Filtrar barbearias pela assinatura' });
                const list = el('div', { className: 'record-list' });
                const renderCustomerList = () => {
                    clear(list);
                    const filtered = customers.filter((customer) => {
                        if (state.platformCustomerFilter === 'all') return true;
                        if (state.platformCustomerFilter === 'attention') return ['past_due', 'expired', 'paused', 'canceled', 'without_subscription'].includes(customer.subscription_status);
                        return customer.subscription_status === state.platformCustomerFilter;
                    });
                    if (!filtered.length) {
                        list.append(emptyState('Nenhuma barbearia nesta situação', 'Escolha outro filtro para ver mais cadastros.'));
                        return;
                    }
                    filtered.forEach((customer) => {
                    const deadline = customer.subscription_status === 'trialing' ? customer.trial_ends_at : customer.current_period_end;
                    const period = deadline ? `Próximo marco: ${formatUtcDateTime(deadline)}` : 'Sem data de cobrança';
                    const statusText = { active: 'Assinatura ativa — pagante', past_due: 'Inadimplente', expired: 'Assinatura vencida', trialing: 'Em teste gratuito', paused: 'Assinatura pausada', canceled: 'Assinatura cancelada', without_subscription: 'Sem assinatura' }[customer.subscription_status] || 'Situação não informada';
                    const clientCounts = `${Number(customer.total_clients || 0)} cliente(s): ${Number(customer.active_clients || 0)} ativo(s)/aprovado(s), ${Number(customer.inactive_clients || 0)} inativo(s)`;
                    list.append(el('article', { className: 'record-row' }, [
                        el('div', { className: 'record-main' }, [
                            el('strong', { text: customer.name }),
                            el('span', { text: `${customer.phone || 'Sem telefone'} • ${customer.address || 'Endereço não informado'}` }),
                            el('span', { text: `${customer.plan_name || 'Sem plano'} • ${period}` }),
                            el('span', { className: 'record-detail', text: `${Number(customer.active_barbers || 0)} barbeiro(s) ativo(s) • ${clientCounts}` })
                        ]),
                        el('div', { className: 'record-secondary' }, [subscriptionPill(customer.subscription_status), el('span', { text: statusText })])
                    ]));
                    });
                };
                filters.forEach(([value, label]) => {
                    const filterButton = button(label, 'filter-button', () => {
                        state.platformCustomerFilter = value;
                        filterBar.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', item === filterButton ? 'true' : 'false'));
                        renderCustomerList();
                    });
                    filterButton.setAttribute('aria-pressed', state.platformCustomerFilter === value ? 'true' : 'false');
                    filterBar.append(filterButton);
                });
                renderCustomerList();
                customersSection.append(filterBar, list);
                customersSection.append(el('p', { className: 'field-hint', text: 'Pagando e inadimplente referem-se à assinatura da barbearia. Pagamentos de cortes individuais não são registrados neste painel.' }));
            }
            const customerForm = el('form', { className: 'form-card', novalidate: true, autocomplete: 'off' });
            const customerName = input('text', 'platform-customer-name', '', { required: true, maxlength: 180, placeholder: 'Nome da barbearia' });
            const customerPhone = input('tel', 'platform-customer-phone', '', { maxlength: 40, placeholder: '(00) 00000-0000' });
            const customerAddress = input('text', 'platform-customer-address', '', { maxlength: 255, placeholder: 'Cidade ou endereço' });
            const ownerName = input('text', 'platform-owner-name', '', { required: true, maxlength: 160, placeholder: 'Nome do responsável' });
            const ownerEmail = input('email', 'platform-owner-email', '', { required: true, maxlength: 190, placeholder: 'responsavel@exemplo.com' });
            const ownerPassword = passwordControl('platform-owner-password', { required: true, minlength: 8, maxlength: 4096 });
            const customerMessage = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
            const customerSubmit = button('Cadastrar cliente comercial', 'button');
            customerSubmit.type = 'submit';
            customerForm.append(el('h3', { text: 'Novo cliente comercial' }), el('p', { text: 'Cria a barbearia, a conta do responsável e inicia automaticamente o teste de 30 dias.' }), el('div', { className: 'form-grid' }, [field('Nome da barbearia', customerName), field('Telefone', customerPhone), field('Endereço', customerAddress), field('Responsável', ownerName), field('E-mail de acesso', ownerEmail), field('Senha inicial', ownerPassword, 'Mínimo de 8 caracteres.')]), customerMessage, el('div', { className: 'form-actions' }, [customerSubmit]));
            customerForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!customerForm.reportValidity() || customerSubmit.disabled) return;
                setButtonBusy(customerSubmit, true, 'Cadastrando...');
                try {
                    await api('platform_customer_save', { method: 'POST', body: { name: customerName.value.trim(), phone: customerPhone.value.trim(), address: customerAddress.value.trim(), owner_name: ownerName.value.trim(), owner_email: ownerEmail.value.trim(), owner_password: ownerPassword.querySelector('input').value } });
                    customerMessage.className = 'form-message success';
                    customerMessage.textContent = 'Cliente comercial cadastrado e teste de 30 dias iniciado.';
                    window.setTimeout(() => renderApp(), 650);
                } catch (error) {
                    customerMessage.className = 'form-message error';
                    customerMessage.textContent = friendlyError(error);
                } finally { setButtonBusy(customerSubmit, false); }
            });
            customersSection.append(customerForm);
        } catch (error) {
            customersSection.append(pageError(error, () => renderApp()));
        }
        content.append(customersSection);

        const plansSection = el('section', { className: 'card section-card', hidden: sectionKey !== 'billing' }, [
            el('h3', { text: 'Planos e pagamentos' }),
            el('p', { className: 'section-description', text: 'A cobrança web será feita pelo Checkout do Asaas. A confirmação ficará dependente dos webhooks do servidor.' })
        ]);
        try {
            const planResult = await api('platform_plans');
            const configuredText = planResult.payment_configured
                ? `Asaas ${planResult.environment === 'production' ? 'produção' : 'sandbox'} configurado.`
                : 'Asaas ainda não configurado: nenhuma cobrança real será iniciada.';
            plansSection.append(el('p', { className: planResult.payment_configured ? 'form-message success' : 'form-message', text: configuredText }));
            const plans = Array.isArray(planResult.plans) ? planResult.plans : [];
            if (!plans.length) {
                plansSection.append(emptyState('Nenhum plano ativo', 'Cadastre o primeiro plano e seu preço antes de liberar o checkout.'));
            } else {
                const planGrid = el('div', { className: 'quick-actions' });
                plans.forEach((plan) => {
                    const price = plan.price_cents === null ? 'Preço não definido' : `${(plan.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/${plan.billing_interval === 'year' ? 'ano' : 'mês'}`;
                    planGrid.append(el('div', { className: 'quick-action' }, [
                        el('strong', { text: plan.name }),
                        el('span', { text: price }),
                        el('span', { text: plan.description || 'Plano recorrente da plataforma.' })
                    ]));
                });
                plansSection.append(planGrid);
            }
            const planForm = el('form', { className: 'form-card', novalidate: true, autocomplete: 'off' });
            const planName = input('text', 'platform-plan-name', '', { required: true, maxlength: 120, value: 'Plano 1 Real por Dia', placeholder: 'Plano 1 Real por Dia' });
            const planCode = input('text', 'platform-plan-code', '', { required: true, maxlength: 64, pattern: '[a-z0-9][a-z0-9_-]{1,63}', value: 'um_real_por_dia', placeholder: 'um_real_por_dia' });
            const planPrice = input('text', 'platform-plan-price', '', { required: true, inputmode: 'decimal', value: '30,00', placeholder: '30,00' });
            const planInterval = selectInput('platform-plan-interval', { required: true });
            addSelectOptions(planInterval, [{ id: 'month', name: 'Mensal' }, { id: 'year', name: 'Anual' }], null);
            const planTrial = input('number', 'platform-plan-trial', '0', { required: true, min: 0, max: 30, step: 1 });
            const planDescription = input('text', 'platform-plan-description', '', { maxlength: 500, value: 'Seu sistema completo por apenas R$ 1 por dia.', placeholder: 'Descrição mostrada no painel' });
            const planMessage = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
            const planSubmit = button('Cadastrar plano', 'button');
            planSubmit.type = 'submit';
            planForm.append(el('h3', { text: 'Novo plano' }), el('p', { text: 'O checkout só será liberado depois que o Asaas estiver configurado no servidor.' }), el('div', { className: 'form-grid' }, [field('Nome', planName), field('Código interno', planCode), field('Preço (R$)', planPrice), field('Periodicidade', planInterval), field('Dias de teste', planTrial), field('Descrição', planDescription)]), planMessage, el('div', { className: 'form-actions' }, [planSubmit]));
            planForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!planForm.reportValidity() || planSubmit.disabled) return;
                setButtonBusy(planSubmit, true, 'Salvando...');
                planMessage.className = 'form-message';
                try {
                    await api('platform_plan_save', { method: 'POST', body: {
                        name: planName.value.trim(), code: planCode.value.trim().toLowerCase(),
                        price_cents: parseBRLCents(planPrice.value), billing_interval: planInterval.value,
                        trial_days: Number(planTrial.value), description: planDescription.value.trim(), active: 1
                    }});
                    planMessage.className = 'form-message success';
                    planMessage.textContent = 'Plano cadastrado.';
                    window.setTimeout(() => renderApp(), 450);
                } catch (error) {
                    planMessage.className = 'form-message error';
                    planMessage.textContent = friendlyError(error);
                } finally { setButtonBusy(planSubmit, false); }
            });
            plansSection.append(planForm);
            const shops = Array.isArray(planResult.barbershops) ? planResult.barbershops : [];
            if (plans.length && shops.length) {
                const checkoutForm = el('form', { className: 'form-card', novalidate: true, autocomplete: 'off' });
                const checkoutShop = selectInput('platform-checkout-shop', { required: true });
                addSelectOptions(checkoutShop, shops, 'Selecione a barbearia');
                const checkoutPlan = selectInput('platform-checkout-plan', { required: true });
                addSelectOptions(checkoutPlan, plans.map((plan) => ({ id: plan.id, name: `${plan.name} — R$ ${(plan.price_cents / 100).toFixed(2).replace('.', ',')}/${plan.billing_interval === 'year' ? 'ano' : 'mês'}` })), 'Selecione o plano');
                const checkoutName = input('text', 'platform-checkout-name', '', { required: true, maxlength: 160, placeholder: 'Nome do responsável' });
                const checkoutEmail = input('email', 'platform-checkout-email', '', { required: true, maxlength: 190, placeholder: 'responsavel@exemplo.com' });
                const checkoutMessage = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
                const checkoutSubmit = button('Gerar checkout Asaas', 'button secondary');
                checkoutSubmit.type = 'submit';
                checkoutForm.append(el('h3', { text: 'Gerar checkout' }), el('p', { text: 'O responsável será enviado ao checkout hospedado do Asaas. A cobrança só será confirmada por webhook.' }), el('div', { className: 'form-grid' }, [field('Barbearia', checkoutShop), field('Plano', checkoutPlan), field('Nome do responsável', checkoutName), field('E-mail do responsável', checkoutEmail)]), checkoutMessage, el('div', { className: 'form-actions' }, [checkoutSubmit]));
                checkoutForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (!checkoutForm.reportValidity() || checkoutSubmit.disabled) return;
                    setButtonBusy(checkoutSubmit, true, 'Criando...');
                    checkoutMessage.className = 'form-message';
                    try {
                        const checkout = await api('platform_checkout', { method: 'POST', body: {
                            barbershop_id: Number(checkoutShop.value), plan_id: Number(checkoutPlan.value),
                            customer_name: checkoutName.value.trim(), customer_email: checkoutEmail.value.trim()
                        }});
                        checkoutMessage.className = 'form-message success';
                        checkoutMessage.textContent = 'Checkout criado. Abrindo a página do Asaas...';
                        window.location.href = checkout.checkout_url;
                    } catch (error) {
                        checkoutMessage.className = 'form-message error';
                        checkoutMessage.textContent = friendlyError(error);
                    } finally { setButtonBusy(checkoutSubmit, false); }
                });
                plansSection.append(checkoutForm);
            }
        } catch (error) {
            plansSection.append(pageError(error, () => renderApp()));
        }
        content.append(plansSection);
    }

    async function renderHome(content) {
        const role = state.user.role;
        const result = await api('summary');
        const data = result.data || {};
        clear(content);
        if (role === 'admin') {
            content.append(pageIntro('Dashboard', 'Acompanhe clientes aprovados e inativos, e abra cada área pelos botões de acesso rápido.', [button('Novo atendimento', 'button', () => navigate('agenda'))]));
            content.append(el('div', { className: 'stats-grid dashboard-stats' }, [
                statCard('Clientes cadastrados', data.clients_total),
                statCard('Clientes ativos/aprovados', data.clients_active ?? data.clients),
                statCard('Clientes inativos', data.clients_inactive),
                statCard('Barbeiros ativos', data.barbers),
                statCard('Atendimentos hoje', data.appointments)
            ]));
            const quick = el('section', { className: 'card section-card' }, [
                el('h3', { text: 'Acesso rápido' }),
                el('p', { className: 'section-description', text: 'Toque em um botão para abrir a área desejada.' }),
                el('div', { className: 'quick-actions dashboard-actions' }, [
                    quickAction('Agenda', 'Consultar e atualizar atendimentos.', 'agenda', 'AG'),
                    quickAction('Clientes', 'Ver, aprovar, editar e inativar clientes.', 'clients', 'CL'),
                    quickAction('Equipe', 'Gerenciar barbeiros e seus acessos.', 'team', 'EQ'),
                    quickAction('Serviços', 'Manter duração, valores e disponibilidade.', 'services', 'SV')
                ])
            ]);
            content.append(quick);
            return;
        }
        if (role === 'barber') {
            const appointments = Array.isArray(data.appointments) ? data.appointments : [];
            content.append(pageIntro('Bom trabalho, ' + state.user.name.split(' ')[0], 'Veja sua agenda e mantenha o status de cada atendimento.', [button('Abrir agenda', 'button', () => navigate('agenda'))]));
            content.append(el('div', { className: 'stats-grid' }, [statCard('Atendimentos hoje', data.today_appointments)]));
            const section = el('section', { className: 'card section-card' }, [el('h3', { text: 'Próximos atendimentos' }), el('p', { className: 'section-description', text: 'Dados carregados da sua agenda.' })]);
            section.append(appointments.length ? el('div', { className: 'appointment-list' }, appointments.map((item) => appointmentCard(item, 'barber'))) : emptyState('Nenhum atendimento próximo', 'Sua agenda não tem próximos registros.'));
            content.append(section);
            return;
        }
        const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
        content.append(pageIntro('Olá, ' + state.user.name.split(' ')[0], 'Agende seu próximo horário e acompanhe seus atendimentos.', [button('Agendar horário', 'button', () => navigate('booking'))]));
        const section = el('section', { className: 'card section-card' }, [el('h3', { text: 'Próximos atendimentos' }), el('p', { className: 'section-description', text: 'Só aparecem atendimentos pendentes ou confirmados da sua conta.' })]);
        section.append(upcoming.length ? el('div', { className: 'appointment-list' }, upcoming.map((item) => appointmentCard(item, 'client'))) : emptyState('Nenhum atendimento agendado', 'Quando você fizer um agendamento, ele aparecerá aqui.'));
        content.append(section);
    }

    function quickAction(title, description, view, symbol = '→') {
        return el('button', { type: 'button', className: 'quick-action', onclick: () => navigate(view) }, [
            el('span', { className: 'quick-action-symbol', 'aria-hidden': 'true', text: symbol }),
            el('span', { className: 'quick-action-copy' }, [el('strong', { text: title }), el('span', { text: description })])
        ]);
    }

    function appointmentCard(item, role) {
        const parsed = dateFromApi(item.starts_at);
        const heading = item.service_name || 'Serviço não informado';
        const meta = [];
        meta.push(el('span', {}, [el('strong', { text: parsed.date ? `${displayDate(parsed.date)} às ${parsed.time}` : formatApiDateTime(item.starts_at) })]));
        if (role !== 'client' && item.client_name) meta.push(el('span', {}, ['Cliente: ', el('strong', { text: item.client_name })]));
        if (role !== 'client' && item.barber_name) meta.push(el('span', {}, ['Barbeiro: ', el('strong', { text: item.barber_name })]));
        if (role === 'client' && item.barber_name) meta.push(el('span', {}, ['Barbeiro: ', el('strong', { text: item.barber_name })]));
        if (item.price_cents !== null && item.price_cents !== undefined) meta.push(el('span', { text: formatBRL(item.price_cents) }));
        const main = el('div', { className: 'appointment-main' }, [
            el('div', { className: 'appointment-heading' }, [el('h3', { text: heading }), statusPill(item.status)]),
            el('div', { className: 'appointment-meta' }, meta)
        ]);
        if (item.notes) main.appendChild(el('p', { className: 'appointment-notes', text: 'Observação: ' + item.notes }));
        const actions = el('div', { className: 'appointment-actions' });
        const transitions = item.status === 'pending' ? ['confirmed', 'cancelled'] : item.status === 'confirmed' ? ['completed', 'no_show', 'cancelled'] : [];
        if (role === 'admin' || role === 'barber') {
            transitions.forEach((next) => actions.appendChild(button(statusActionLabel(next), next === 'cancelled' ? 'button danger small' : 'button secondary small', () => changeAppointmentStatus(item.id, next, actions))));
        } else if (['pending', 'confirmed'].includes(item.status)) {
            actions.appendChild(button('Cancelar', 'button danger small', () => cancelAppointment(item.id, actions)));
        }
        return el('article', { className: 'appointment-card' }, [main, actions]);
    }

    function statusActionLabel(status) {
        return { confirmed: 'Confirmar', completed: 'Concluir', cancelled: 'Cancelar', no_show: 'Não compareceu' }[status] || status;
    }

    async function changeAppointmentStatus(id, nextStatus, actions) {
        if (!id || !nextStatus || actions.dataset.busy === '1') return;
        actions.dataset.busy = '1';
        Array.from(actions.querySelectorAll('button')).forEach((node) => { node.disabled = true; });
        try {
            await api('appointment_status', { method: 'POST', body: { appointment_id: Number(id), status: nextStatus } });
            showToast(`Status atualizado: ${statusLabels[nextStatus] || nextStatus}.`);
            renderApp();
        } catch (error) {
            actions.dataset.busy = '0';
            Array.from(actions.querySelectorAll('button')).forEach((node) => { node.disabled = false; });
            showToast(friendlyError(error), 'error');
        }
    }

    async function cancelAppointment(id, actions) {
        if (actions.dataset.busy === '1') return;
        actions.dataset.busy = '1';
        Array.from(actions.querySelectorAll('button')).forEach((node) => { node.disabled = true; });
        try {
            await api('appointment_cancel', { method: 'POST', body: { appointment_id: Number(id) } });
            showToast('Atendimento cancelado.');
            renderApp();
        } catch (error) {
            actions.dataset.busy = '0';
            Array.from(actions.querySelectorAll('button')).forEach((node) => { node.disabled = false; });
            showToast(friendlyError(error), 'error');
        }
    }

    // Adds the status to the button itself so the handler never infers data from user-facing text.
    function wireStatusButtons(root) {
        root.querySelectorAll('.appointment-actions button').forEach((node) => {
            const label = node.textContent || '';
            const status = Object.entries({ confirmed: 'Confirmar', completed: 'Concluir', cancelled: 'Cancelar', no_show: 'Não compareceu' }).find(([, value]) => value === label);
            if (status) node.dataset.nextStatus = status[0];
        });
    }

    function calendarEvent(item, role) {
        const parsed = dateFromApi(item.starts_at);
        const event = el('div', { className: `calendar-event ${item.status || 'pending'}` }, [
            el('div', { className: 'calendar-time' }, [el('strong', { text: parsed.time || '—' }), el('span', { text: formatTime(item.ends_at) })]),
            appointmentCard(item, role)
        ]);
        return event;
    }

    async function renderAgenda(content) {
        const isAdmin = state.user.role === 'admin';
        const isBarber = state.user.role === 'barber';
        const isClient = state.user.role === 'client';
        const date = state.agendaDate;
        let result;
        try {
            result = await api('appointment_list', { params: { date } });
        } catch (error) {
            clear(content);
            content.append(pageIntro('Agenda', 'Escolha uma data para consultar os atendimentos.'));
            content.append(pageError(error, () => renderApp()));
            return;
        }
        clear(content);
        const newButton = isAdmin ? button('＋ Novo atendimento', 'button') : isClient ? button('＋ Agendar horário', 'button') : null;
        content.append(pageIntro('Agenda', isAdmin ? 'Uma visão diária dos atendimentos da barbearia.' : isBarber ? 'Seus atendimentos organizados por horário.' : 'Seus horários confirmados e pendentes, organizados como uma agenda.', newButton ? [newButton] : []));
        const toolbar = el('div', { className: 'toolbar' });
        const dateInput = input('date', 'agenda-date', date, { max: '', 'aria-label': 'Data da agenda' });
        const dateGroup = el('div', { className: 'date-toolbar' }, [
            button('Anterior', 'button secondary small', () => { state.agendaDate = shiftDate(state.agendaDate, -1); renderApp(); }),
            el('strong', { text: displayDate(date, true) }),
            dateInput,
            button('Próximo', 'button secondary small', () => { state.agendaDate = shiftDate(state.agendaDate, 1); renderApp(); }),
            button('Hoje', 'button ghost small', () => { state.agendaDate = saoPauloToday(); renderApp(); })
        ]);
        dateInput.addEventListener('change', () => { if (dateInput.value) { state.agendaDate = dateInput.value; renderApp(); } });
        toolbar.append(dateGroup);
        content.append(toolbar);
        const appointments = Array.isArray(result.appointments) ? result.appointments : [];
        const calendar = el('section', { className: 'calendar-day', 'aria-label': `Agenda de ${displayDate(date, true)}` }, [
            el('div', { className: 'calendar-day-heading' }, [
                el('div', { className: 'calendar-date-badge' }, [el('span', { text: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '') }), el('strong', { text: date.slice(8, 10) })]),
                el('div', {}, [el('strong', { text: displayDate(date, true) }), el('span', { text: appointments.length ? `${appointments.length} atendimento(s)` : 'Nenhum evento agendado' })])
            ])
        ]);
        if (!appointments.length) calendar.append(emptyState('Nenhum atendimento nesta data', isClient ? 'Toque em “Agendar horário” para criar seu próximo horário.' : 'Não há registros reais para o dia escolhido.'));
        else appointments.forEach((item) => calendar.append(calendarEvent(item, isClient ? 'client' : isAdmin ? 'admin' : 'barber')));
        content.append(calendar);
        wireStatusButtons(content);
        if (isAdmin) {
            const panel = el('section', { id: 'admin-booking-panel', className: 'card form-card', hidden: true });
            content.append(panel);
            if (newButton) newButton.addEventListener('click', () => {
                if (panel.hidden) {
                    panel.hidden = false;
                    newButton.textContent = 'Fechar novo atendimento';
                    renderAdminBookingForm(panel, date);
                    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    panel.hidden = true;
                    newButton.textContent = 'Novo atendimento';
                }
            });
        } else if (isClient && newButton) {
            newButton.addEventListener('click', () => navigate('booking'));
        }
    }

    function toggleAdminBooking(content) {
        const panel = content.querySelector('#admin-booking-panel');
        if (panel) panel.hidden = !panel.hidden;
    }

    async function renderAdminBookingForm(panel, date) {
        clear(panel);
        panel.append(el('h3', { text: 'Novo atendimento' }), el('p', { text: 'Selecione cliente, barbeiro, serviço e um horário retornado pela disponibilidade real.' }), el('div', { className: 'form-message', text: 'Carregando opções...' }));
        try {
            const [clientsResult, barbersResult, servicesResult] = await Promise.all([
                api('users', { params: { role: 'client' } }),
                api('users', { params: { role: 'barber' } }),
                api('services')
            ]);
            buildBookingForm(panel, {
                admin: true,
                date,
                clients: (clientsResult.users || []).filter((item) => item.status === 'active'),
                barbers: (barbersResult.users || []).filter((item) => item.status === 'active'),
                services: (servicesResult.services || []).filter((item) => Number(item.active) === 1)
            });
        } catch (error) {
            clear(panel);
            panel.append(el('h3', { text: 'Novo atendimento' }), pageError(error, () => renderAdminBookingForm(panel, date)));
        }
    }

    async function renderBookingPage(content, admin = false) {
        clear(content);
        content.append(pageIntro('Novo agendamento', 'Escolha uma data, barbeiro, serviço e um horário que esteja disponível.'));
        const panel = el('section', { className: 'card form-card' });
        content.append(panel);
        if (admin) {
            return renderAdminBookingForm(panel, state.agendaDate);
        }
        panel.append(el('h3', { text: 'Agendar para mim' }), el('p', { text: 'Os dados do cliente serão vinculados à sua conta.' }), el('div', { className: 'form-message', text: 'Carregando opções...' }));
        try {
            const catalog = await api('catalog');
            buildBookingForm(panel, { admin: false, date: saoPauloToday(), clients: [], barbers: catalog.barbers || [], services: catalog.services || [] });
        } catch (error) {
            clear(panel);
            panel.append(pageError(error, () => renderBookingPage(content, false)));
        }
    }

    function buildBookingForm(panel, options) {
        clear(panel);
        const form = el('form', { className: 'auth-form', novalidate: true });
        const dateInput = input('date', 'booking-date', options.date || saoPauloToday(), { required: true, min: saoPauloToday() });
        const barberSelect = selectInput('booking-barber', { required: true });
        const serviceSelect = selectInput('booking-service', { required: true });
        const slotSelect = selectInput('booking-slot', { required: true, disabled: true });
        const notes = el('textarea', { id: 'booking-notes', maxlength: 500, placeholder: 'Opcional, até 500 caracteres' });
        addSelectOptions(barberSelect, options.barbers, 'Selecione o barbeiro');
        addSelectOptions(serviceSelect, options.services, 'Selecione o serviço');
        clear(slotSelect);
        slotSelect.appendChild(el('option', { value: '', text: 'Escolha barbeiro e serviço primeiro' }));
        const clientSelect = options.admin ? selectInput('booking-client', { required: true }) : null;
        if (clientSelect) addSelectOptions(clientSelect, options.clients, 'Selecione o cliente');
        const message = el('p', { className: 'form-message', role: 'status', 'aria-live': 'polite' });
        const submit = button('Confirmar agendamento', 'button');
        submit.type = 'submit';
        const grid = el('div', { className: 'form-grid three' });
        if (clientSelect) grid.append(field('Cliente', clientSelect));
        grid.append(field('Data', dateInput), field('Barbeiro', barberSelect), field('Serviço', serviceSelect), field('Horário disponível', slotSelect), field('Observações', notes));
        form.append(grid, message, el('div', { className: 'form-actions' }, [submit]));
        panel.append(el('h3', { text: options.admin ? 'Novo atendimento' : 'Agendar para mim' }), el('p', { text: options.admin ? 'O horário abaixo será consultado na API antes do salvamento.' : 'Escolha uma opção de horário retornada pela agenda.' }), form);

        async function refreshSlots() {
            clear(slotSelect);
            slotSelect.disabled = true;
            slotSelect.appendChild(el('option', { value: '', text: 'Consultando horários...' }));
            message.className = 'form-message';
            message.textContent = '';
            if (!dateInput.value || !barberSelect.value || !serviceSelect.value) {
                clear(slotSelect);
                slotSelect.appendChild(el('option', { value: '', text: 'Escolha data, barbeiro e serviço' }));
                return;
            }
            try {
                const result = await api('availability', { params: { date: dateInput.value, barber_id: barberSelect.value, service_id: serviceSelect.value } });
                clear(slotSelect);
                const slots = Array.isArray(result.slots) ? result.slots : [];
                slotSelect.appendChild(el('option', { value: '', text: slots.length ? 'Selecione o horário' : 'Nenhum horário disponível' }));
                slots.forEach((slot) => {
                    const option = el('option', { value: slot.starts_at, text: `${formatTime(slot.starts_at)} – ${formatTime(slot.ends_at)}` });
                    option.dataset.endsAt = slot.ends_at;
                    slotSelect.appendChild(option);
                });
                slotSelect.disabled = !slots.length;
                if (!slots.length) message.textContent = 'Não há horários livres para esta combinação.';
            } catch (error) {
                clear(slotSelect);
                slotSelect.appendChild(el('option', { value: '', text: 'Não foi possível carregar horários' }));
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            }
        }
        [dateInput, barberSelect, serviceSelect].forEach((control) => control.addEventListener('change', refreshSlots));
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity() || submit.disabled) return;
            const selected = slotSelect.options[slotSelect.selectedIndex];
            if (!selected || !selected.value || !selected.dataset.endsAt) {
                message.className = 'form-message error';
                message.textContent = 'Escolha um horário disponível.';
                return;
            }
            const body = {
                barber_id: Number(barberSelect.value),
                service_id: Number(serviceSelect.value),
                starts_at: selected.value,
                ends_at: selected.dataset.endsAt,
                notes: notes.value.trim()
            };
            if (clientSelect) body.client_id = Number(clientSelect.value);
            setButtonBusy(submit, true, 'Salvando...');
            message.className = 'form-message';
            message.textContent = '';
            try {
                await api('appointment_create', { method: 'POST', body });
                showToast('Agendamento criado como pendente.');
                if (options.admin) {
                    state.agendaDate = dateInput.value;
                    navigate('agenda', true);
                } else {
                    navigate('history');
                }
            } catch (error) {
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            } finally {
                setButtonBusy(submit, false);
            }
        });
    }

    async function renderHistory(content) {
        const result = await api('history');
        const appointments = Array.isArray(result.appointments) ? result.appointments : [];
        clear(content);
        content.append(pageIntro('Meu histórico', 'Consulte seus atendimentos e cancele os que ainda estiverem pendentes ou confirmados.', [button('Novo agendamento', 'button', () => navigate('booking'))]));
        const list = el('section', { className: 'appointment-list', 'aria-label': 'Histórico de atendimentos' });
        if (!appointments.length) list.append(emptyState('Nenhum atendimento no histórico', 'Os atendimentos da sua conta aparecerão aqui.'));
        else appointments.forEach((item) => list.append(appointmentCard(item, 'client')));
        content.append(list);
    }

    async function renderPeoplePage(content, role) {
        const title = role === 'client' ? 'Clientes' : 'Equipe';
        const description = role === 'client' ? 'Crie, edite e altere o status de clientes sem apagar o histórico.' : 'Mantenha os barbeiros ativos ou inativos sem apagar o histórico.';
        let result;
        try {
            result = await api('users', { params: { role } });
        } catch (error) {
            clear(content);
            content.append(pageIntro(title, description), pageError(error, () => renderApp()));
            return;
        }
        const users = Array.isArray(result.users) ? result.users : [];
        clear(content);
        content.append(pageIntro(title, description, [button(role === 'client' ? 'Novo cliente' : 'Novo barbeiro', 'button', () => { state.editingUser = null; renderPeopleContent(content, role, users); })]));
        renderPeopleContent(content, role, users, true);
    }

    function renderPeopleContent(content, role, users, replaceListOnly = false) {
        const old = content.querySelector('.split-layout');
        if (old) old.remove();
        const editing = state.editingUser && state.editingUser.role === role ? state.editingUser : null;
        const form = userForm(role, editing, async () => {
            try {
                const result = await api('user_save', { method: 'POST', body: collectUserPayload(role, editing, form) });
                state.editingUser = null;
                showToast(editing ? 'Cadastro atualizado.' : 'Cadastro criado.');
                const fresh = await api('users', { params: { role } });
                renderPeopleContent(content, role, fresh.users || [], true);
            } catch (error) {
                const message = form.querySelector('.form-message');
                message.className = 'form-message error';
                message.textContent = friendlyError(error);
            }
        });
        const list = el('section', { className: 'card section-card' }, [el('h3', { text: 'Registros' }), el('p', { className: 'section-description', text: `${users.length} resultado(s) retornado(s) pela API.` })]);
        const records = el('div', { className: 'records-list' });
        if (!users.length) records.append(emptyState('Nenhum registro encontrado', 'Use o formulário para cadastrar o primeiro registro.'));
        users.forEach((user) => {
            const edit = button('Editar', 'button ghost small', () => { state.editingUser = user; renderPeopleContent(content, role, users, true); });
            const toggle = button(user.status === 'active' ? 'Inativar' : 'Ativar', user.status === 'active' ? 'button danger small' : 'button secondary small', async () => {
                if (toggle.disabled) return;
                setButtonBusy(toggle, true, 'Salvando...');
                try {
                    await api('user_save', { method: 'POST', body: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status === 'active' ? 'inactive' : 'active' } });
                    showToast(user.status === 'active' ? 'Cadastro inativado.' : 'Cadastro ativado.');
                    const fresh = await api('users', { params: { role } });
                    renderPeopleContent(content, role, fresh.users || [], true);
                } catch (error) { showToast(friendlyError(error), 'error'); setButtonBusy(toggle, false); }
            });
            records.append(el('article', { className: 'record-card' }, [
                el('div', { className: 'record-primary' }, [el('strong', { text: user.name }), el('small', { text: user.email })]),
                el('div', { className: 'record-secondary' }, [statusPill(user.status), edit, toggle])
            ]));
        });
        list.append(records);
        const layout = el('div', { className: 'split-layout' }, [form, list]);
        content.append(layout);
        if (!replaceListOnly) return;
    }

    function userForm(role, editing, onSubmit) {
        const form = el('form', { className: 'card form-card', novalidate: true, autocomplete: 'off' });
        const name = input('text', 'user-name-input', editing ? editing.name : '', { maxlength: 160, required: true, autocomplete: 'name', placeholder: 'Nome completo' });
        const email = input('email', 'user-email-input', editing ? editing.email : '', { maxlength: 190, required: true, autocomplete: 'email', placeholder: 'email@exemplo.com' });
        const status = selectInput('user-status-input', { required: true });
        addSelectOptions(status, [{ id: 'active', name: 'Ativo' }, { id: 'inactive', name: 'Inativo' }], null);
        status.value = editing ? editing.status : 'active';
        const password = passwordControl('user-password-input', { maxlength: 4096, minlength: 8, required: !editing, placeholder: editing ? 'Deixe em branco para manter' : 'Mínimo de 8 caracteres' });
        const message = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
        const submit = button(editing ? 'Salvar alterações' : `Cadastrar ${role === 'client' ? 'cliente' : 'barbeiro'}`, 'button');
        submit.type = 'submit';
        form.append(el('h3', { text: editing ? 'Editar cadastro' : `Novo ${role === 'client' ? 'cliente' : 'barbeiro'}` }), el('p', { text: editing ? 'A senha é opcional na edição.' : 'A senha inicial precisa ter no mínimo 8 caracteres.' }), el('div', { className: 'form-grid' }, [field('Nome completo', name), field('E-mail', email), field('Status', status), field('Senha', password, editing ? 'Opcional na edição.' : 'Obrigatória, mínimo de 8 caracteres.')]), message, el('div', { className: 'form-actions' }, [submit, editing ? button('Cancelar edição', 'button secondary', () => { state.editingUser = null; renderApp(); }) : null]));
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity() || submit.disabled) return;
            if (!editing && password.querySelector('input').value.length < 8) { message.className = 'form-message error'; message.textContent = 'A senha precisa ter no mínimo 8 caracteres.'; return; }
            setButtonBusy(submit, true, 'Salvando...');
            try {
                await onSubmit();
            } finally {
                if (submit.isConnected) setButtonBusy(submit, false);
            }
        });
        return form;
    }

    function collectUserPayload(role, editing, form) {
        const payload = {
            name: form.querySelector('#user-name-input').value.trim(),
            email: form.querySelector('#user-email-input').value.trim(),
            role,
            status: form.querySelector('#user-status-input').value
        };
        const password = form.querySelector('#user-password-input').value;
        if (password) payload.password = password;
        if (editing) payload.id = Number(editing.id);
        return payload;
    }

    async function renderServicesPage(content) {
        let result;
        try { result = await api('services'); } catch (error) {
            clear(content);
            content.append(pageIntro('Serviços', 'Consulte os serviços disponíveis.'), pageError(error, () => renderApp()));
            return;
        }
        const services = Array.isArray(result.services) ? result.services : [];
        clear(content);
        const admin = state.user.role === 'admin';
        content.append(pageIntro('Serviços', admin ? 'Cadastre ou edite serviços sem inserir valores ou durações automaticamente.' : 'Serviços ativos disponíveis para agendamento.'));
        renderServicesContent(content, services, admin);
    }

    function renderServicesContent(content, services, admin) {
        const old = content.querySelector('.split-layout');
        if (old) old.remove();
        const list = el('section', { className: 'card section-card' }, [el('h3', { text: 'Catálogo' }), el('p', { className: 'section-description', text: `${services.length} serviço(s) retornado(s) pela API.` })]);
        const records = el('div', { className: 'records-list' });
        if (!services.length) records.append(emptyState('Nenhum serviço encontrado', admin ? 'Cadastre um serviço usando o formulário.' : 'Não há serviços ativos no momento.'));
        services.forEach((service) => {
            const actions = [];
            if (admin) actions.push(button('Editar', 'button ghost small', () => { state.editingService = service; renderServicesContent(content, services, admin); }));
            records.append(el('article', { className: 'record-card' }, [
                el('div', { className: 'record-primary' }, [el('strong', { text: service.name }), el('small', { text: `${service.duration_minutes} minutos • ${formatBRL(service.price_cents)}` }), service.description ? el('p', { className: 'service-description', text: service.description }) : null]),
                el('div', { className: 'record-secondary' }, [el('span', { className: `status ${Number(service.active) === 1 ? 'confirmed' : 'cancelled'}`, text: Number(service.active) === 1 ? 'Ativo' : 'Inativo' }), el('span', { className: 'service-price', text: formatBRL(service.price_cents) }), ...actions])
            ]));
        });
        list.append(records);
        if (admin) {
            const form = serviceForm(state.editingService, async () => {
                const editing = state.editingService;
                try {
                    await api('service_save', { method: 'POST', body: collectServicePayload(form, editing) });
                    state.editingService = null;
                    showToast(editing ? 'Serviço atualizado.' : 'Serviço criado.');
                    const fresh = await api('services');
                    renderServicesContent(content, fresh.services || [], true);
                } catch (error) {
                    const message = form.querySelector('.form-message');
                    message.className = 'form-message error';
                    message.textContent = friendlyError(error);
                }
            });
            content.append(el('div', { className: 'split-layout' }, [form, list]));
        } else content.append(list);
    }

    function serviceForm(editing, onSubmit) {
        const form = el('form', { className: 'card form-card', novalidate: true });
        const name = input('text', 'service-name-input', editing ? editing.name : '', { required: true, maxlength: 140, placeholder: 'Nome do serviço' });
        const duration = input('number', 'service-duration-input', editing ? editing.duration_minutes : '', { required: true, min: 5, max: 480, step: 1, placeholder: '5 a 480' });
        const price = input('text', 'service-price-input', editing ? formatBRLInput(editing.price_cents) : '', { required: true, inputmode: 'decimal', placeholder: '0,00' });
        const active = el('input', { type: 'checkbox', id: 'service-active-input', checked: editing ? Number(editing.active) === 1 : true });
        const description = el('textarea', { id: 'service-description-input', maxlength: 5000, placeholder: 'Descrição opcional' });
        if (editing && editing.description) description.value = editing.description;
        const reference = selectInput('service-reference-input');
        addSelectOptions(reference, serviceReferences.map(([label, cents]) => ({ id: cents, name: `${label} — ${formatBRL(cents)}` })), 'Usar uma referência de preço (opcional)');
        const message = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
        const submit = button(editing ? 'Salvar alterações' : 'Cadastrar serviço', 'button');
        submit.type = 'submit';
        reference.addEventListener('change', () => { if (reference.value) price.value = formatBRLInput(Number(reference.value)); });
        form.append(el('h3', { text: editing ? 'Editar serviço' : 'Novo serviço' }), el('p', { text: 'A duração é obrigatória e nenhum serviço é criado automaticamente.' }), el('div', { className: 'form-grid' }, [field('Nome', name), field('Duração em minutos', duration, 'Entre 5 e 480 minutos.'), el('div', { className: 'field' }, [el('label', { htmlFor: price.id, text: 'Valor' }), price, el('div', { className: 'price-reference' }, [el('label', { htmlFor: reference.id, text: 'Referência opcional:' }), reference])]), el('div', { className: 'field' }, [el('span', { className: 'field-label', text: 'Disponibilidade' }), el('div', { className: 'checkbox-field' }, [active, el('label', { htmlFor: active.id, text: 'Serviço ativo para agendamento' })])]), field('Descrição', description)]), message, el('div', { className: 'form-actions' }, [submit, editing ? button('Cancelar edição', 'button secondary', () => { state.editingService = null; renderApp(); }) : null]));
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!form.reportValidity() || submit.disabled) return;
            const cents = parseBRLCents(price.value);
            if (cents === null || cents < 0 || cents > 100000000) { message.className = 'form-message error'; message.textContent = 'Informe um valor em reais válido.'; return; }
            setButtonBusy(submit, true, 'Salvando...');
            await onSubmit();
            if (submit.isConnected) setButtonBusy(submit, false);
        });
        return form;
    }

    function collectServicePayload(form, editing) {
        const payload = {
            name: form.querySelector('#service-name-input').value.trim(),
            duration_minutes: Number(form.querySelector('#service-duration-input').value),
            price_cents: parseBRLCents(form.querySelector('#service-price-input').value),
            active: form.querySelector('#service-active-input').checked ? 1 : 0,
            description: form.querySelector('#service-description-input').value.trim()
        };
        if (editing) payload.id = Number(editing.id);
        return payload;
    }

    async function renderAccount(content) {
        clear(content);
        const user = state.user;
        const passwordForm = el('form', { className: 'card form-card', novalidate: true, autocomplete: 'off' });
        const current = passwordControl('current-password', { required: true, maxlength: 4096 });
        const next = passwordControl('new-password', { required: true, minlength: 8, maxlength: 4096 });
        const confirm = passwordControl('new-password-confirm', { required: true, minlength: 8, maxlength: 4096 });
        const message = el('p', { className: 'form-message', role: 'alert', 'aria-live': 'polite' });
        const submit = button('Alterar senha', 'button');
        submit.type = 'submit';
        passwordForm.append(el('h3', { text: 'Trocar senha' }), el('p', { text: 'A nova senha precisa ter no mínimo 8 caracteres.' }), field('Senha atual', current), field('Nova senha', next), field('Confirmar nova senha', confirm), message, el('div', { className: 'form-actions' }, [submit]));
        passwordForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (!passwordForm.reportValidity() || submit.disabled) return;
            const currentValue = current.querySelector('input').value;
            const nextValue = next.querySelector('input').value;
            const confirmValue = confirm.querySelector('input').value;
            if (nextValue !== confirmValue) { message.className = 'form-message error'; message.textContent = 'As senhas não coincidem.'; return; }
            setButtonBusy(submit, true, 'Salvando...');
            try {
                const result = await api('change_password', { method: 'POST', body: { current_password: currentValue, new_password: nextValue, new_password_confirm: confirmValue } });
                current.querySelector('input').value = ''; next.querySelector('input').value = ''; confirm.querySelector('input').value = '';
                if (result.require_login) {
                    state.user = null;
                    navigate('login', true);
                    showToast('Senha alterada. Entre novamente com sua nova senha.');
                    return;
                }
                message.className = 'form-message success'; message.textContent = 'Senha alterada com sucesso.';
            } catch (error) { message.className = 'form-message error'; message.textContent = friendlyError(error); }
            finally { setButtonBusy(submit, false); }
        });
        const profile = el('section', { className: 'card profile-card' }, [
            el('div', { className: 'profile-avatar', text: initials(user.name), 'aria-hidden': 'true' }),
            el('h3', { text: user.name }),
            el('p', { text: user.email }),
            el('div', { className: 'profile-details' }, [
                el('div', {}, [el('span', { text: 'Perfil' }), el('strong', { text: roleLabel(user.role) })]),
                el('div', {}, [el('span', { text: 'Status' }), el('strong', { text: user.status === 'active' ? 'Ativo' : user.status })])
            ])
        ]);
        content.append(pageIntro('Minha conta', 'Confira seus dados e mantenha sua senha atualizada.'), el('div', { className: 'account-grid' }, [profile, passwordForm]));
    }

    window.addEventListener('popstate', () => {
        const view = new URLSearchParams(window.location.search).get('view') || 'login';
        state.view = routes.includes(view) ? view : 'login';
        renderApp();
    });

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await loadSession();
            if (!state.user && !['login', 'forgot', 'reset'].includes(state.view)) state.view = 'login';
            if (state.user && ['login', 'forgot', 'reset'].includes(state.view)) state.view = defaultViewForRole(state.user.role);
            renderApp();
        } catch (error) {
            clear(app);
            app.className = 'auth-layout';
            const card = el('section', { className: 'auth-card' }, [el('h2', { text: 'Barber Shop indisponível' }), el('p', { className: 'subheading', text: 'Não foi possível iniciar a sessão com segurança.' }), pageError(error, () => window.location.reload())]);
            app.append(el('div', { className: 'auth-wrap' }, [authBrand(), card]));
        }
    });
})();
