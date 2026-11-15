import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { TreeModule, type TreeNodeExpandEvent, type TreeNodeCollapseEvent, type TreeNodeSelectEvent } from 'primeng/tree';
import type { TreeNode } from 'primeng/api';
import { buildFolderTree, type DmsFolder, type FolderNode } from '../../core';

const KEY = 'k:'; // node keys are prefixed so an empty folder id is still a valid key

/** The folder hierarchy. Pure presentation: give it a flat folder list, it tells you which one was picked. */
@Component({
  selector: 'dms-folder-tree',
  standalone: true,
  imports: [TreeModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-tree
      [value]="view().nodes"
      selectionMode="single"
      [metaKeySelection]="true"
      [selection]="view().selected"
      (onNodeSelect)="onSelect($event)"
      (onNodeExpand)="onToggle($event, true)"
      (onNodeCollapse)="onToggle($event, false)"
      [filter]="true"
      filterPlaceholder="Search folders..."
      styleClass="border-0"
    />
    @if (folders().length === 0 && !loading()) {
      <p class="text-sm text-center py-6 opacity-50">No folders.</p>
    }
  `,
})
export class FolderTreeComponent {
  readonly folders = input.required<readonly DmsFolder[]>();
  readonly selectedId = input<string | null>(null);
  readonly loading = input<boolean>(false);
  /** Emits the id of the folder the user picked. */
  readonly select = output<string>();

  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  private seeded = false;

  constructor() {
    // Open every folder the first time a tree arrives; afterwards remember what the user collapsed.
    effect(() => {
      const list = this.folders();
      untracked(() => {
        if (!this.seeded && list.length > 0) {
          this.seeded = true;
          this.expanded.set(new Set(list.map((f) => f.id)));
        }
      });
    });
  }

  protected readonly view = computed(() => {
    const open = this.expanded();
    const sel = this.selectedId();
    const found: { node: TreeNode | null } = { node: null };
    const toNode = (n: FolderNode): TreeNode => {
      const node: TreeNode = {
        key: KEY + n.folder.id,
        label: n.folder.name,
        data: n.folder,
        expanded: open.has(n.folder.id),
        expandedIcon: 'pi pi-folder-open',
        collapsedIcon: 'pi pi-folder',
        icon: 'pi pi-folder',
        children: n.children.map(toNode),
      };
      if (n.folder.id === sel) found.node = node;
      return node;
    };
    return { nodes: buildFolderTree(this.folders()).map(toNode), selected: found.node };
  });

  protected onSelect(e: TreeNodeSelectEvent): void {
    const key = String(e.node.key ?? '');
    if (key.startsWith(KEY)) this.select.emit(key.slice(KEY.length));
  }

  protected onToggle(e: TreeNodeExpandEvent | TreeNodeCollapseEvent, open: boolean): void {
    const id = String(e.node.key ?? '').slice(KEY.length);
    this.expanded.update((s) => {
      const next = new Set(s);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
