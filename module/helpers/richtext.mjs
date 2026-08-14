/**
 * Adds an edit/save toggle for HTML fields: renders the enriched markup by default,
 * swaps to a raw textarea on "Edit", and writes it back + reverts to rendered view on "Save".
 * Pair with the `templates/partials/richtext.hbs` partial.
 */
export function RichTextMixin(Base) {
  return class RichTextSheet extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        editText: RichTextSheet._onEditText,
        saveText: RichTextSheet._onSaveText
      }
    };

    /** Field keys (short names used in the partial's `field=` param) currently being edited. */
    get editingFields() {
      return (this._editingFields ??= new Set());
    }

    static _onEditText(event, target) {
      this.editingFields.add(target.closest("[data-field]").dataset.field);
      this.render();
    }

    static async _onSaveText(event, target) {
      const wrap = target.closest("[data-field]");
      const { field, path } = wrap.dataset;
      const textarea = wrap.querySelector("textarea");
      if (textarea && path) await this.document.update({ [path]: textarea.value });
      this.editingFields.delete(field);
      this.render();
    }
  };
}
