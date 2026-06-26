/**
 * Floor-filter dropdowns live inside surfaces that already use backdrop-filter
 * (island panel, mobile bottom sheet). Chromium treats that as a "backdrop root",
 * so changing --glass-blur has no visible effect on the menu. Reparent the open
 * menu to a top-level host with fixed coordinates so blur samples the map.
 */

const HOST_ID = 'floorMenuPortalHost';

function getHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement('div');
        host.id = HOST_ID;
        host.className = 'floor-menu-portal-host';
        document.body.appendChild(host);
    } else if (host.parentElement !== document.body) {
        document.body.appendChild(host);
    }
    return host;
}

function positionMenu(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.left = 'auto';
    menu.style.minWidth = `${Math.max(160, rect.width)}px`;
}

/**
 * @param {{ wrap: HTMLElement, menu: HTMLElement, trigger: HTMLElement }} opts
 */
export function openFloorMenuPortal({ wrap, menu, trigger }) {
    if (menu.classList.contains('is-portaled')) return;

    menu._portalHome = { parent: wrap, next: menu.nextSibling };
    menu.classList.add('is-portaled');
    getHost().appendChild(menu);
    positionMenu(menu, trigger);

    const reposition = () => positionMenu(menu, trigger);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    menu._portalReposition = reposition;
}

export function closeFloorMenuPortal(menu) {
    if (!menu?._portalHome) return;

    if (menu._portalReposition) {
        window.removeEventListener('scroll', menu._portalReposition, true);
        window.removeEventListener('resize', menu._portalReposition);
    }

    menu.classList.remove('is-portaled');
    menu.style.top = '';
    menu.style.right = '';
    menu.style.left = '';
    menu.style.minWidth = '';

    const { parent, next } = menu._portalHome;
    if (parent.isConnected) {
        if (next) parent.insertBefore(menu, next);
        else parent.appendChild(menu);
    } else {
        menu.remove();
    }

    delete menu._portalHome;
    delete menu._portalReposition;

    const host = document.getElementById(HOST_ID);
    if (host && !host.childElementCount) host.remove();
}

/** True when the click is outside both the trigger wrap and a portaled menu. */
export function isFloorMenuOutsideClick(wrap, e) {
    if (wrap?.contains(e.target)) return false;
    const portaled = document.querySelector('.isl-floor-menu.is-portaled, .ms-floor-menu.is-portaled');
    if (portaled?.contains(e.target)) return false;
    return true;
}
