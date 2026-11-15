import { Component, computed, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import {
  DocumentManagerComponent,
  canPickLocalFolder,
  createSource,
  pickLocalFolder,
  toDmsError,
  type DocumentSource,
  type ManifestFolder,
  type SourceConfig,
} from '../src';

interface DemoGlobals {
  config?: { source: SourceConfig['source']; folder_source?: { baseUrl?: string; readOnly?: boolean }; gdrive_source?: { rootFolderId: string; accessToken?: string } };
  manifest?: ManifestFolder;
}

const globals = (): DemoGlobals => (window as unknown as { __DMS_DEMO__?: DemoGlobals }).__DMS_DEMO__ ?? {};

/** Hosting app: reads data/config.js + data/manifest.js, builds the configured source, and shows the document manager. */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DocumentManagerComponent, ButtonModule],
  template: `
    <header class="bg-slate-800 text-white px-6 py-3 flex items-center justify-between flex-wrap gap-2">
      <span class="font-semibold">stl-dms — demo host</span>
      <span class="text-xs text-slate-300">config: data/config.js · tree: data/manifest.js</span>
    </header>

    <main class="p-6 max-w-7xl mx-auto">
      <section class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="text-sm">
            <div class="font-semibold text-gray-700">Source in use</div>
            <code class="text-gray-600">{{ configText() }}</code>
          </div>
          <div class="flex gap-2">
            <p-button label="Config source" icon="pi pi-cog" [outlined]="mode() !== 'config'" (onClick)="useConfig()" />
            <p-button
              label="Open local folder..."
              icon="pi pi-folder-open"
              [outlined]="mode() !== 'picked'"
              [disabled]="!canPick"
              attr.title="{{ canPick ? 'Browse a real folder on this computer (read/write)' : 'Needs Chrome or Edge' }}"
              (onClick)="pickFolder()"
            />
          </div>
        </div>
        @if (error()) {
          <p class="mt-3 text-sm text-red-600">{{ error() }}</p>
        }
        @if (isDriveConfig()) {
          <p class="mt-3 text-sm text-amber-700">
            Google Drive needs a real <code>rootFolderId</code> and OAuth <code>accessToken</code> in data/config.js; the placeholders will be rejected by Drive.
          </p>
        }
      </section>

      @if (source(); as s) {
        <dms-document-manager [source]="s" />
      }
    </main>
  `,
})
export class AppComponent {
  protected readonly canPick = canPickLocalFolder();
  protected readonly source = signal<DocumentSource | null>(null);
  protected readonly mode = signal<'config' | 'picked'>('config');
  protected readonly error = signal<string | null>(null);

  protected readonly configText = computed(() => {
    if (this.mode() === 'picked') return "{ source: 'folder_source', folder_source: { handle: <picked folder> } }";
    const c = globals().config;
    if (!c) return '(data/config.js not loaded)';
    return c.source === 'gdrive_source'
      ? `{ source: 'gdrive_source', gdrive_source: { rootFolderId: '${c.gdrive_source?.rootFolderId ?? ''}', accessToken: '***' } }`
      : `{ source: 'folder_source', folder_source: { baseUrl: '${c.folder_source?.baseUrl ?? '.'}', readOnly: ${String(c.folder_source?.readOnly ?? false)} } }`;
  });
  protected readonly isDriveConfig = computed(() => this.mode() === 'config' && globals().config?.source === 'gdrive_source');

  constructor() {
    this.useConfig();
  }

  protected useConfig(): void {
    this.error.set(null);
    this.mode.set('config');
    const { config, manifest } = globals();
    if (!config) return this.error.set('data/config.js was not loaded');
    try {
      const cfg: SourceConfig = { source: config.source };
      if (config.source === 'folder_source') {
        if (!manifest) return this.error.set('data/manifest.js was not loaded (run `npm run samples`)');
        cfg.folder_source = { manifest, ...config.folder_source };
      } else if (config.gdrive_source) {
        cfg.gdrive_source = config.gdrive_source;
      }
      this.source.set(createSource(cfg));
    } catch (e) {
      this.error.set(toDmsError(e).message);
    }
  }

  protected async pickFolder(): Promise<void> {
    this.error.set(null);
    try {
      this.source.set(await pickLocalFolder());
      this.mode.set('picked');
    } catch (e) {
      const err = toDmsError(e);
      if (err.message !== 'No folder chosen') this.error.set(err.message);
    }
  }
}
