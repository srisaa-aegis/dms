import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DmsFolder } from '../../core';

/** Root > Folder > Sub-folder trail; each crumb is clickable. */
@Component({
  selector: 'dms-breadcrumb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (path().length > 0) {
      <nav class="flex items-center flex-wrap gap-1 text-sm opacity-70" aria-label="Folder path">
        @for (f of path(); track f.id; let last = $last) {
          <span [class]="last ? 'font-medium' : 'cursor-pointer hover:underline'" (click)="!last && navigate.emit(f.id)">{{ f.name }}</span>
          @if (!last) {
            <i class="pi pi-chevron-right text-xs"></i>
          }
        }
      </nav>
    }
  `,
})
export class BreadcrumbComponent {
  /** Root-to-current path (see `folderPath` in the core). */
  readonly path = input.required<readonly DmsFolder[]>();
  readonly navigate = output<string>();
}
