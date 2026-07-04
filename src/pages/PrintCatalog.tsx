import { useI18n } from '../lib/I18nContext';

function PrintCatalog() {
  const { t } = useI18n();
  return (
    <div>
      <h1>{t('collection.catalogTitle')}</h1>
    </div>
  );
}

export default PrintCatalog;
