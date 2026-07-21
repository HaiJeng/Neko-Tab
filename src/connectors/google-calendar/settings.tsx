import { useGoogleCalendar } from './useGoogleCalendar';
import { isIdentityAvailable } from '../../utils/browser';
import { useTranslation } from '../../i18n';

interface CalendarSettingsProps {
  config: Record<string, unknown>
  onConfigChange: (patch: Record<string, unknown>) => void
}

export function GoogleCalendarSettings({ config, onConfigChange }: CalendarSettingsProps) {
  const { t } = useTranslation();
  const { isConnected, connect, disconnect, error } = useGoogleCalendar(false);
  const enabled = !!config.enabled;
  const lookahead = (config.lookahead as number) ?? 4320;
  const isExt = isIdentityAvailable();

  return (
    <div className='saas-card'>
      <label className='saas-label'>Google Calendar</label>

      {!isExt && (
        <div className='saas-hint' style={{ color: '#ffb300', marginBottom: 16, border: '1px solid rgba(255, 179, 0, 0.2)', padding: '8px', borderRadius: '4px' }}>
          {t('connector.gcal.identityWarning')}
        </div>
      )}

      <div className='saas-toggle-list' style={{ marginBottom: 12 }}>
        <div className="saas-toggle-row">
          <span className="saas-toggle-label">{t('connector.gcal.showUpcoming')}</span>
          <button
            className={`saas-toggle-btn ${enabled ? 'active' : ''}`}
            onClick={() => onConfigChange({ enabled: !enabled })}
            disabled={!isConnected}
            style={{ opacity: !isConnected ? 0.5 : 1, cursor: !isConnected ? 'not-allowed' : 'pointer' }}
          >
            <div className="saas-toggle-thumb" />
          </button>
        </div>
      </div>

      {isConnected && (
        <div className='saas-flex-row' style={{ marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="saas-label" style={{ margin: 0 }}>{t('connector.gcal.showWithin')}</span>
          <select
            className='saas-input'
            style={{ width: 'auto', padding: '4px 8px', height: '32px' }}
            value={lookahead}
            onChange={(e) => onConfigChange({ lookahead: Number(e.target.value) })}
          >
            <option value={60}>{t('connector.gcal.range.1hour')}</option>
            <option value={360}>{t('connector.gcal.range.6hours')}</option>
            <option value={4320}>{t('connector.gcal.range.3days')}</option>
            <option value={10080}>{t('connector.gcal.range.7days')}</option>
            <option value={14400}>{t('connector.gcal.range.10days')}</option>
          </select>
        </div>
      )}

      {!isConnected ? (
        <div>
          <p className='saas-hint' style={{ marginBottom: 12 }}>{t('connector.gcal.connectHint')}</p>
          <button className='saas-btn-primary' onClick={connect}>
            {t('connector.gcal.connect')}
          </button>
        </div>
      ) : (
        <div>
          <p className='saas-hint' style={{ marginBottom: 12, color: 'var(--accent-color)' }}>{t('connector.gcal.connected')}</p>
          <button className='saas-btn-secondary' onClick={disconnect}>
            {t('connector.gcal.disconnect')}
          </button>
        </div>
      )}

      {error && (
        <p className='saas-hint' style={{ marginTop: 12, color: '#ff4444' }}>{t('connector.gcal.error', { message: error })}</p>
      )}
    </div>
  );
}