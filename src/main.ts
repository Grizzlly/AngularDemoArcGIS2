import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import esriConfig from '@arcgis/core/config';

esriConfig.apiKey = environment.arcgisApiKey;

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
