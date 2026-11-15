import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent, {
  providers: [provideAnimationsAsync(), providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: false } } })],
}).catch((err: unknown) => console.error(err));
