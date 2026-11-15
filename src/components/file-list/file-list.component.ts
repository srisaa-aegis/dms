import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { fileIcon, formatDate, formatSize, type DmsFile } from '../../core';

/** The files of one folder, with view / download / rename / delete actions. */
@Component({
  selector: 'dms-file-list',
  standalone: true,
  imports: [TableModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-table [value]="asArray(files())" [loading]="loading()" styleClass="p-datatable-sm" [paginator]="files().length > 20" [rows]="20">
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 30px"></th>
          <th>Name</th>
          <th style="width: 100px">Size</th>
          <th style="width: 130px">Modified</th>
          <th [style.width]="readOnly() ? '110px' : '170px'"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-f>
        <tr>
          <td>
            @if (busyId() === f.id) {
              <i class="pi pi-spin pi-spinner text-blue-500"></i>
            } @else {
              <i [class]="icon(f.mimeType)"></i>
            }
          </td>
          <td class="font-medium cursor-pointer hover:underline" (click)="open.emit(f)">{{ f.name }}</td>
          <td class="text-sm opacity-70">{{ size(f.size) }}</td>
          <td class="text-sm opacity-70">{{ date(f.modifiedAt) }}</td>
          <td class="text-right whitespace-nowrap">
            <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" title="View" (onClick)="open.emit(f)" />
            <p-button icon="pi pi-download" [text]="true" [rounded]="true" size="small" title="Download" (onClick)="download.emit(f)" />
            @if (!readOnly()) {
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" title="Rename" (onClick)="rename.emit(f)" />
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" title="Delete" (onClick)="remove.emit(f)" />
            }
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="5" class="text-center py-8 opacity-40">No files in this folder</td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class FileListComponent {
  readonly files = input.required<readonly DmsFile[]>();
  readonly loading = input<boolean>(false);
  readonly readOnly = input<boolean>(false);
  /** Id of the file currently being opened/downloaded (shows a spinner). */
  readonly busyId = input<string | null>(null);

  readonly open = output<DmsFile>();
  readonly download = output<DmsFile>();
  readonly rename = output<DmsFile>();
  readonly remove = output<DmsFile>();

  protected readonly icon = fileIcon;
  protected readonly size = formatSize;
  protected readonly date = formatDate;

  protected asArray(files: readonly DmsFile[]): DmsFile[] {
    return files as DmsFile[];
  }
}
