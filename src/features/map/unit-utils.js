/** True when a room feature is marked disabled in geojson properties. */
export function isUnitDisabled(props) {
    if (!props) return false;
    const v = props.disabled;
    return v === true || v === 1 || v === '1' || v === 'true';
}

export function isWalkingArea(props) {
    return props?.sublayer === 'walking';
}

export function isBuildingShell(props, shellIds) {
    if (!props) return false;
    const id = props.id != null ? String(props.id) : '';
    if (shellIds?.has?.(id)) return true;
    return props.sublayer === 'building' && id && !id.startsWith('ID');
}

export function normalizeRoomFeatureId(id) {
    if (id == null || id === '') return '';
    return String(id).replace(/_\d+_?$/, '');
}

/** Walking corridors and the flat building envelope — never selectable. */
export function isNonInteractiveFloorUnit(props, shellIds) {
    if (!props) return false;
    if (props.__floor_noninteractive === 1 || props.__floor_noninteractive === true) return true;
    if (isWalkingArea(props)) return true;
    return isBuildingShell(props, shellIds);
}
