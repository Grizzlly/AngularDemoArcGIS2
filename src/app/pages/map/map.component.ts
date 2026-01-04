import {
	Component,
	CUSTOM_ELEMENTS_SCHEMA,
	DestroyRef,
	ElementRef,
	ViewChild,
	inject,
	signal,
	output,
	AfterViewInit,
} from '@angular/core';

import esriConfig from '@arcgis/core/config';
import WebMap from '@arcgis/core/WebMap';
import MapView from '@arcgis/core/views/MapView';

import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import Point from '@arcgis/core/geometry/Point';

import FeatureLayer from '@arcgis/core/layers/FeatureLayer';

import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import RouteParameters from '@arcgis/core/rest/support/RouteParameters';
import * as route from '@arcgis/core/rest/route';

import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';

type DirectionStep = {
	text: string;
	lengthMiles: number;
};

@Component({
	standalone: true,
	selector: 'app-map',
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	styleUrl: './map.component.css',
	templateUrl: './map.component.html',
})
export class MapComponent implements AfterViewInit {
	readonly mapLoadedEvent = output<boolean>();

	@ViewChild('mapViewNode', { static: true })
	private readonly mapViewEl!: ElementRef<HTMLDivElement>;

	private readonly destroyRef = inject(DestroyRef);

	readonly loaded = signal(false);
	readonly directions = signal<DirectionStep[]>([]);

	private map!: WebMap;
	private view!: MapView;

	private graphicsLayer!: GraphicsLayer;
	private graphicsLayerUserPoints!: GraphicsLayer;
	private graphicsLayerRoutes!: GraphicsLayer;

	private trailheadsLayer!: FeatureLayer;

	private readonly zoom = 10;
	private readonly center: [number, number] = [-118.73682450024377, 34.07817583063242];
	private readonly basemap: string = 'streets-vector';

	private readonly routeUrl =
		'https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World';

	async ngAfterViewInit(): Promise<void> {
		await this.initializeMap();

		this.loaded.set(true);
		this.mapLoadedEvent.emit(true);

		this.destroyRef.onDestroy(() => {
			this.view?.destroy();
		});
	}

	private async initializeMap(): Promise<void> {
		this.map = new WebMap({ basemap: this.basemap });

		this.addFeatureLayers();
		this.addGraphicsLayers();

		this.view = new MapView({
			container: this.mapViewEl.nativeElement,
			map: this.map,
			center: this.center,
			zoom: this.zoom,
		});

		const moveHandle = this.view.on('pointer-move', ['Shift'], (event) => {
			const point = this.view.toMap({ x: event.x, y: event.y }) as Point;
			if (point) console.log('Map pointer moved:', point.longitude, point.latitude);
		});

		const clickHandle = this.view.on('click', async (event) => {
			const hit = (await this.view.hitTest(event)) as __esri.HitTestResult;

			const mapPoint = hit?.results
				?.find((r) => r.layer === this.trailheadsLayer)
				?.mapPoint as Point | undefined;

			if (!mapPoint) return;

			if (this.graphicsLayerUserPoints.graphics.length === 0) {
				this.addPoint(mapPoint.latitude!, mapPoint.longitude!);
				return;
			}

			if (this.graphicsLayerUserPoints.graphics.length === 1) {
				this.addPoint(mapPoint.latitude!, mapPoint.longitude!);
				await this.calculateRoute();
				return;
			}

			this.clearRoute();
		});

		this.destroyRef.onDestroy(() => {
			moveHandle.remove();
			clickHandle.remove();
		});

		await this.view.when();
		console.log('ArcGIS map loaded');
	}

	private addFeatureLayers(): void {
		this.trailheadsLayer = new FeatureLayer({
			url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads/FeatureServer/0',
			outFields: ['*'],
		});
		this.map.add(this.trailheadsLayer);

		this.map.add(
			new FeatureLayer({
				url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trails/FeatureServer/0',
			}),
			0
		);

		this.map.add(
			new FeatureLayer({
				url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Parks_and_Open_Space/FeatureServer/0',
			}),
			0
		);

		console.log('Feature layers added');
	}

	private addGraphicsLayers(): void {
		this.graphicsLayer = new GraphicsLayer();
		this.graphicsLayerUserPoints = new GraphicsLayer();
		this.graphicsLayerRoutes = new GraphicsLayer();

		this.map.addMany([this.graphicsLayer, this.graphicsLayerUserPoints, this.graphicsLayerRoutes]);
	}

	private addPoint(lat: number, lng: number): void {
		const point = new Point({ latitude: lat, longitude: lng });

		const symbol = new SimpleMarkerSymbol({
			color: [226, 119, 40],
			outline: {
				color: [255, 255, 255],
				width: 1,
			},
		});

		const g = new Graphic({
			geometry: point,
			symbol,
		});

		this.graphicsLayerUserPoints.add(g);
	}

	clearRoute(): void {
		this.graphicsLayerRoutes?.removeAll();
		this.graphicsLayerUserPoints?.removeAll();
		this.directions.set([]);
		console.log('Route cleared');
	}

	private async calculateRoute(): Promise<void> {
		const params = new RouteParameters({
			stops: new FeatureSet({
				features: this.graphicsLayerUserPoints.graphics.toArray(),
			}),
			returnDirections: true,
		});

		try {
			const data = await route.solve(this.routeUrl, params);
			this.displayRoute(data);
		} catch (err) {
			console.error('Error calculating route:', err);
			alert('Error calculating route');
		}
	}

	private displayRoute(data: any): void {
		this.graphicsLayerRoutes.removeAll();
		this.directions.set([]);

		for (const result of data.routeResults ?? []) {
			result.route.symbol = {
				type: 'simple-line',
				color: [5, 150, 255],
				width: 3,
			};
			this.graphicsLayerRoutes.add(result.route);
		}

		const first = data.routeResults?.[0];
		const features = first?.directions?.features ?? [];

		if (features.length === 0) {
			alert('No directions found');
			return;
		}

		const steps: DirectionStep[] = features.map((f: any) => ({
			text: String(f.attributes?.text ?? ''),
			lengthMiles: Number(f.attributes?.length ?? 0),
		}));

		this.directions.set(steps);
	}
}
