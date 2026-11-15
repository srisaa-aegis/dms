import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { validateName } from '../../core';

/** A one-field dialog used for "New folder" and "Rename". Validates the name before confirming. */
@Component({
  selector: 'dms-name-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog [header]="title()" [(visible)]="visible" [modal]="true" [style]="{ width: '400px' }">
      <div class="flex flex-col gap-1 pt-2">
        <label class="text-sm font-medium">{{ label() }} *</label>
        <input pInputText class="w-full" [ngModel]="value()" (ngModelChange)="value.set($event)" (keyup.enter)="confirm()" />
        @if (touched() && error()) {
          <small class="text-red-600">{{ error() }}</small>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button [label]="confirmLabel()" icon="pi pi-check" [disabled]="!!error()" (onClick)="confirm()" />
      </ng-template>
    </p-dialog>
  `,
})
export class NameDialogComponent {
  readonly visible = model<boolean>(false);
  readonly title = input<string>('Name');
  readonly label = input<string>('Name');
  readonly confirmLabel = input<string>('OK');
  /** Pre-filled value each time the dialog opens. */
  readonly initial = input<string>('');
  readonly confirmed = output<string>();

  protected readonly value = signal('');
  protected readonly touched = signal(false);
  protected readonly error = computed(() => validateName(this.value()));

  constructor() {
    effect(() => {
      if (this.visible()) {
        const initial = untracked(() => this.initial());
        this.value.set(initial);
        this.touched.set(false);
      }
    });
  }

  protected confirm(): void {
    this.touched.set(true);
    if (this.error()) return;
    this.confirmed.emit(this.value().trim());
  }
}
