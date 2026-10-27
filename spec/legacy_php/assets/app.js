// =====================================================================
//  Study Kanban — общий клиентский JS
// =====================================================================

(function () {
    'use strict';

    // -------- Контейнер для тостов --------
    function ensureToastContainer() {
        let el = document.getElementById('toastContainer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toastContainer';
            document.body.appendChild(el);
        }
        return el;
    }

    // -------- Иконки для типов --------
    const ICONS = {
        success: '✅',
        error:   '⛔',
        info:    'ℹ️',
        warning: '⚠️',
    };

    /**
     * Показать всплывающее уведомление.
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration — мс, 0 = не закрывать
     */
    function showToast(message, type = 'info', duration = 3000) {
        const container = ensureToastContainer();

        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.innerHTML =
            '<span style="font-size:16px;line-height:1">' + (ICONS[type] || '•') + '</span>' +
            '<span style="flex:1">' + escapeHtml(message) + '</span>' +
            '<button type="button" style="opacity:.5;cursor:pointer;background:none;border:none;color:inherit;font-size:16px;line-height:1;padding:0 4px">×</button>';

        const closeBtn = toast.querySelector('button');
        const remove = () => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 200);
        };
        closeBtn.addEventListener('click', remove);

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(remove, duration);
        }
        return remove;
    }

    // -------- Экранирование --------
    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    // -------- Плавное появление модалок --------
    // Автоматически вешаем классы на .fixed модалки при открытии/закрытии
    // Работает через MutationObserver — не надо менять код везде
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
            const el = m.target;
            if (!el.classList.contains('fixed')) continue;

            const isHidden = el.classList.contains('hidden');
            const backdrop = el;

            if (!isHidden && !backdrop.dataset.animated) {
                backdrop.dataset.animated = '1';
                backdrop.classList.add('modal-backdrop');
                // Первый div внутри — панель
                const panel = el.firstElementChild;
                if (panel) panel.classList.add('modal-panel');
            }
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.fixed.inset-0').forEach(el => {
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        });
    });

    // -------- Экспорт в window --------
    window.showToast = showToast;
    window.escapeHtml = escapeHtml;

    // -------- Перехватываем alert() и заменяем на toast? --------
    // Осторожно: не будем, чтобы не сломать confirm() для удаления.
    // Пусть каждый файл сам вызывает showToast() где надо.
})();
