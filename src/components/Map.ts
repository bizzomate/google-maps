import { CSSProperties, Component, ReactElement, createElement } from "react";

import * as classNames from "classnames";
import GoogleMap, { GoogleMapLoader, GoogleMapProps, LatLng } from "google-map-react";

import { Alert } from "./Alert";
import { Marker, MarkerProps } from "./Marker";
import { Location } from "../utils/ContainerUtils";

import "../ui/GoogleMaps.css";

export type widthUnitType = "percentage" | "pixels";
export type heightUnitType = "percentageOfWidth" | "percentageOfParent" | "pixels";

export interface MapProps {
    className?: string;
    apiKey?: string;
    autoZoom: boolean;
    defaultCenterAddress: string;
    defaultCenterLatitude: string;
    defaultCenterLongitude: string;
    friendlyId?: string;
    height: number;
    heightUnit: heightUnitType;
    mapStyles: string;
    locations: Location[];
    optionDrag: boolean;
    optionMapControl: boolean;
    optionScroll: boolean;
    optionStreetView: boolean;
    optionZoomControl: boolean;
    width: number;
    widthUnit: widthUnitType;
    zoomLevel: number;
    style: object;
}

export interface MapState {
    alertMessage?: string;
    center?: LatLng;
    isLoaded?: boolean;
    locations?: Location[];
}

export class Map extends Component<MapProps, MapState> {
    // Location of Mendix Netherlands office
    private defaultCenterLocation: LatLng = { lat: 51.9107963, lng: 4.4789878 };
    private mapLoader?: GoogleMapLoader;
    private bounds: google.maps.LatLngBounds;

    constructor(props: MapProps) {
        super(props);

        this.state = {
            center: this.defaultCenterLocation,
            isLoaded: false,
            locations: props.locations
        };
        this.handleOnGoogleApiLoaded = this.handleOnGoogleApiLoaded.bind(this);
        this.onResizeIframe = this.onResizeIframe.bind(this);
        this.renderGoogleMap = this.renderGoogleMap.bind(this);
        this.setCenter = this.setCenter.bind(this);
    }

    render() {
        return createElement("div",
            {
                className: classNames("widget-google-maps-wrapper", this.props.className),
                style: this.getStyle()
            },
            createElement("div", { className: "widget-google-maps" },
                createElement(Alert, {
                    bootstrapStyle: "danger",
                    className: "widget-google-maps-alert",
                    message: this.state.alertMessage
                }),
                this.renderGoogleMap()
            )
        );
    }

    componentDidMount() {
        this.setUpEvents();
    }

    componentWillReceiveProps(nextProps: MapProps) {
        this.setState({ locations: nextProps.locations });
        this.resolveAddresses(nextProps);
    }

    componentWillUnmount() {
        if (this.getIframe()) {
            window.removeEventListener("resize", this.onResizeIframe);
        }
    }

    private renderGoogleMap(): ReactElement<GoogleMapProps> | null {
        return createElement(GoogleMap,
            {
                bootstrapURLKeys: { key: this.props.apiKey },
                center: this.state.center,
                defaultZoom: this.props.zoomLevel,
                onGoogleApiLoaded: this.handleOnGoogleApiLoaded,
                options: {
                    draggable: this.props.optionDrag,
                    fullscreenControl: false,
                    mapTypeControl: this.props.optionMapControl,
                    maxZoom: 20,
                    minZoom: 2,
                    minZoomOverride: true,
                    resetBoundsOnResize: true,
                    scrollwheel: this.props.optionScroll,
                    streetViewControl: this.props.optionStreetView,
                    zoomControl: this.props.optionZoomControl,
                    styles: this.getMapsStyles()
                },
                resetBoundsOnResize: true,
                yesIWantToUseGoogleMapApiInternals: true
            },
            this.createMakers()
        );
    }

    private getMapsStyles(): any {
        if (this.props.mapStyles.trim()) {
            try {
                return JSON.parse(this.props.mapStyles);
            } catch (error) {
                // tslint:disable no-console
                console.error("Error parsing Maps styles", error, this.props.mapStyles);
            }
        }
        return [ {
            featureType: "poi",
            elementType: "labels",
            stylers: [ { visibility: "off" } ]
        } ];
    }

    private setUpEvents() {
        // A workaround for attaching the resize event to the Iframe window because the google-map-react
        // library does not support it. This fix will be done in the web modeler preview class when the
        // google-map-react library starts supporting listening to Iframe events.
        const iFrame = this.getIframe();
        if (iFrame) {
            iFrame.contentWindow.addEventListener("resize", this.onResizeIframe);
        }
    }

    private getIframe(): HTMLIFrameElement {
        return document.getElementsByClassName("t-page-editor-iframe")[0] as HTMLIFrameElement;
    }

    private onResizeIframe(_event: CustomEvent) {
        if (this.mapLoader) {
            const originalCenter = this.mapLoader.map.getCenter();
            this.mapLoader.maps.event.trigger(this.mapLoader.map, "resize");
            this.mapLoader.map.setCenter(originalCenter);
            window.dispatchEvent(new Event("resize"));
        }
    }

    private getStyle(): object {
        const style: CSSProperties = {
            width: this.props.widthUnit === "percentage" ? `${this.props.width}%` : `${this.props.width}px`
        };
        if (this.props.heightUnit === "percentageOfWidth") {
            style.paddingBottom = `${this.props.height}%`;
        } else if (this.props.heightUnit === "pixels") {
            style.paddingBottom = `${this.props.height}px`;
        } else if (this.props.heightUnit === "percentageOfParent") {
            style.height = `${this.props.height}%`;
        }

        return { ...style, ...this.props.style };
    }

    private handleOnGoogleApiLoaded(mapLoader: GoogleMapLoader) {
        if (mapLoader.maps && mapLoader.map) {
            this.mapLoader = mapLoader;
            this.setState({ isLoaded: true });
            this.resolveAddresses(this.props);
        } else {
            const alertMessage = "Google maps load failed, check internet connection.";
            this.setState({ alertMessage });
        }
    }

    private updateBounds(props: MapProps, location: Location) {
        if (this.mapLoader) {
            this.bounds.extend(new google.maps.LatLng(location.latitude as number, location.longitude as number));
            this.mapLoader.map.fitBounds(this.bounds);
            this.setZoom(props);
        }
    }

    private setZoom(props: MapProps): void {
        if (this.mapLoader) {
            let zoom = this.mapLoader.map.getZoom();
            if (props.autoZoom) {
                if (zoom && (zoom < 2) || !zoom) {
                    zoom = 2;
                }
            } else {
                zoom = props.zoomLevel;
            }

            this.mapLoader.map.setZoom(zoom);
        }
    }

    private resolveAddresses(props: MapProps) {
        const invalidLocations: string[] = [];

        if (this.mapLoader) {
            this.bounds = new google.maps.LatLngBounds();
        }
        this.setZoom(props);
        if (props.locations && props.locations.length) {
            props.locations.forEach(location => {
                if (!this.validLocation(location) && location.address) {
                    this.getLocation(location.address, locationLookup => {
                        if (locationLookup) {
                            location.latitude = Number(locationLookup.lat);
                            location.longitude = Number(locationLookup.lng);
                            this.setState({ locations: props.locations });
                            this.updateBounds(props, location);
                        } else {
                            invalidLocations.push(`${location.address}`);
                        }
                    });
                } else if (this.validLocation(location)) {
                    this.updateBounds(props, location);
                }
            });
            if (invalidLocations.length > 0) {
                this.setState({ alertMessage: `Can not find address ${invalidLocations.join(", ")}` });
            } else {
                this.setState({ alertMessage: "" });
            }
        }

        this.setCenter();
    }

    private validLocation(location: Location): boolean {
        const { latitude: lat, longitude: lng } = location;
        return typeof lat === "number" && typeof lng === "number"
            && lat <= 90 && lat >= -90
            && lng <= 180 && lng >= -180
            && !(lat === 0 && lng === 0);
    }

    private setCenter() {
        if (this.props.defaultCenterLatitude && this.props.defaultCenterLongitude) {
              this.setState({
                  center: {
                      lat: Number(this.props.defaultCenterLatitude),
                      lng: Number(this.props.defaultCenterLongitude)
                  }
              });
        } else if (this.props.defaultCenterAddress) {
            this.getLocation(this.props.defaultCenterAddress, location =>
                location ? this.setState({ center: location }) : this.setState({ center: this.defaultCenterLocation }));
        } else if (this.bounds) {
            this.setState({
                center: {
                    lat: this.bounds.getCenter().lat(),
                    lng: this.bounds.getCenter().lng()
                }
            });
        }
    }

    private getLocation(address: string, callback: (result?: LatLng) => void) {
        if (this.state.isLoaded) {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address }, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK) {
                    this.setState({ alertMessage: "" });
                    callback({
                        lat: results[0].geometry.location.lat(),
                        lng: results[0].geometry.location.lng()
                    });
                } else if (status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
                    this.setState({ alertMessage: "Failed to look up the address. Google Geocoder free request quota exceeded." });
                    callback();
                } else {
                    this.setState({ alertMessage: `Can not find address ${address}` });
                    callback();
                }
            });
        } else {
            callback();
        }
    }

    private createMakers(): Array<ReactElement<MarkerProps>> {
        const markerElements: Array<ReactElement<MarkerProps>> = [];

        if (this.state.isLoaded && this.state.locations && this.state.locations.length) {
            this.state.locations.map((locationObject, index) => {
                const { latitude, longitude, url } = locationObject;
                if (this.validLocation(locationObject)) {
                    markerElements.push(createElement(Marker, {
                        key: index,
                        lat: latitude as number,
                        lng: longitude as number,
                        url
                    }));
                }
            });
        }
        return markerElements;
    }
}
