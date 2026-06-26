/**
 * SVG viewBox / content-space ↔ WGS84. Shared by the SVG converter and the
 * routing API client (server paths are returned in SVG pixels).
 */

const round8 = (n) => Math.round(n * 1e8) / 1e8;

export class GeoTransform {
    constructor(svgWidth, svgHeight, {
        centerLat = 0, centerLng = 0, scale = 0.03,
        originX = 0, originY = 0, rotation = 0,
    } = {}) {
        this.svgW = svgWidth;
        this.svgH = svgHeight;
        this.originX = originX;
        this.originY = originY;
        this.scale = scale;
        this.centerLat = centerLat;
        this.centerLng = centerLng;
        this.rotationDeg = rotation;
        this.rotationRad = rotation * Math.PI / 180;

        const metersPerDegLat = 111320.0;
        this.cosLat = Math.cos(centerLat * Math.PI / 180) || 1;
        const metersPerDegLng = 111320.0 * this.cosLat;

        this.geoW = (svgWidth * scale) / metersPerDegLng;
        this.geoH = (svgHeight * scale) / metersPerDegLat;

        this.minLng = centerLng - this.geoW / 2;
        this.maxLat = centerLat + this.geoH / 2;
    }

    toLngLat(x, y) {
        let lng = this.minLng + ((x - this.originX) / this.svgW) * this.geoW;
        let lat = this.maxLat - ((y - this.originY) / this.svgH) * this.geoH;

        if (this.rotationRad !== 0) {
            const dlng = lng - this.centerLng;
            const dlat = lat - this.centerLat;
            const dxm = dlng * this.cosLat;
            const dym = dlat;
            const cos_r = Math.cos(this.rotationRad);
            const sin_r = Math.sin(this.rotationRad);
            const rxm = dxm * cos_r - dym * sin_r;
            const rym = dxm * sin_r + dym * cos_r;
            lng = this.centerLng + rxm / this.cosLat;
            lat = this.centerLat + rym;
        }
        return [round8(lng), round8(lat)];
    }

    toSvg(lng, lat) {
        let lngP = lng;
        let latP = lat;
        if (this.rotationRad !== 0) {
            const dlng = lng - this.centerLng;
            const dlat = lat - this.centerLat;
            const rxm = dlng * this.cosLat;
            const rym = dlat;
            const cos_r = Math.cos(this.rotationRad);
            const sin_r = Math.sin(this.rotationRad);
            const dxm =  rxm * cos_r + rym * sin_r;
            const dym = -rxm * sin_r + rym * cos_r;
            lngP = this.centerLng + dxm / this.cosLat;
            latP = this.centerLat + dym;
        }
        const x = this.originX + ((lngP - this.minLng) / this.geoW) * this.svgW;
        const y = this.originY + ((this.maxLat - latP) / this.geoH) * this.svgH;
        return [x, y];
    }
}

export function geoTransformFromVenue(venue) {
    const align = venue?.geoAlignment;
    const mapCenter = venue?.mapCenter || null;
    const centerLat = align?.centerLat ?? mapCenter?.lat ?? 0;
    const centerLng = align?.centerLng ?? mapCenter?.lng ?? 0;
    const scale = align?.scale ?? 0.03;
    const rotation = align?.rotation ?? 0;
    const originX = align?.originX ?? 0;
    const originY = align?.originY ?? 0;
    const svgW = align?.svgWidth ?? align?.width ?? 0;
    const svgH = align?.svgHeight ?? align?.height ?? 0;

    if (!svgW || !svgH) return null;

    return new GeoTransform(svgW, svgH, {
        centerLat, centerLng, scale, rotation, originX, originY,
    });
}
