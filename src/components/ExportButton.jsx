import { api } from '../lib/api';
import { useI18n } from '../lib/I18nContext';

function ExportButton({ filters, disabled = false }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => api.exportCollection('csv', filters)} disabled={disabled} className="secondary-button disabled:opacity-50">
        {t('collection.exportCsv')}
      </button>
      <button type="button" onClick={() => api.exportCollection('xlsx', filters)} disabled={disabled} className="primary-button disabled:opacity-50">
        {t('collection.exportExcel')}
      </button>
    </div>
  );
}

export default ExportButton;
