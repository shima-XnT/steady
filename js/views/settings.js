// ============================================
// Steady — 設定画面
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};
  App.Views = App.Views || {};

  // Legacy fallback view:
  // 現在の正式仕様は final-views.js 側の Settings が主担当。
  // ここは保険用に残すが、shared/local の境界と保存ルールは同じ仕様に揃えて保守する。

  App.Views.Settings = {
    async render() {
      const settings = await App.DB.getAllSettings();

      return `
        <div class="container animate-in">
          <h2 class="page-title"><span class="icon">⚙️</span> 設定</h2>

          <!-- 目標設定（共有設定：スプレッドシートに保存） -->
          <div class="card mb-16">
            <h3 class="mb-16">🎯 トレーニング目標 <span class="text-xs text-muted">（共有設定）</span></h3>
            <div class="form-group">
              <div class="form-label">週の目標回数</div>
              <select class="form-select" id="set-weekly-goal">
                ${[1,2,3,4,5].map(n => `<option value="${n}" ${(settings.weeklyGoal || 3) == n ? 'selected' : ''}>${n}回/週</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <div class="form-label">1回あたりの理想時間</div>
              <select class="form-select" id="set-session-duration">
                ${[20,30,40,50,60].map(n => `<option value="${n}" ${(settings.sessionDuration || 40) == n ? 'selected' : ''}>${n}分</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- ジム設定（共有設定） -->
          <div class="card mb-16">
            <h3 class="mb-16">🏋️ ジム設定 <span class="text-xs text-muted">（共有設定）</span></h3>
            <div class="grid-2">
              <div class="form-group">
                <div class="form-label">利用開始時刻</div>
                <input type="time" class="form-input" id="set-gym-start" value="${settings.gymHoursStart || '22:00'}">
              </div>
              <div class="form-group">
                <div class="form-label">利用終了時刻</div>
                <input type="time" class="form-input" id="set-gym-end" value="${settings.gymHoursEnd || '23:59'}">
              </div>
            </div>
          </div>

          <!-- 判定設定（共有設定） -->
          <div class="card mb-16">
            <h3 class="mb-16">🔍 判定設定 <span class="text-xs text-muted">（共有設定）</span></h3>
            <div class="form-group">
              <div class="form-label">判定の厳しさ</div>
              <div class="range-group">
                <div class="range-header">
                  <span class="text-xs text-muted">やさしめ</span>
                  <span class="range-value" id="strictness-value">${settings.strictness || 50}%</span>
                  <span class="text-xs text-muted">厳しめ</span>
                </div>
                <input type="range" id="set-strictness" min="0" max="100" step="10"
                  value="${settings.strictness || 50}">
              </div>
              <div class="text-xs text-muted mt-4">
                やさしめ: スキップしやすくなります ／ 厳しめ: 通常メニュー寄りになります
              </div>
            </div>
          </div>

          <!-- 健康データ設定（端末ローカル） -->
          <div class="card mb-16">
            <h3 class="mb-16">💊 健康データ <span class="text-xs text-muted">（端末設定）</span></h3>
            <div class="form-group">
              <div class="form-label">データソース</div>
              <select class="form-select" id="set-health-provider">
                <option value="manual" ${(settings.healthProvider || 'manual') === 'manual' ? 'selected' : ''}>手入力</option>
                <option value="health_connect" ${settings.healthProvider === 'health_connect' ? 'selected' : ''}>Health Connect</option>
              </select>
            </div>
            <div class="data-status ${App.healthProvider.getStatus()} mt-8 mb-12">
              <span class="data-status-dot"></span>
              ${App.healthProvider.getStatusLabel()}
            </div>
            ${App.healthProvider.name === 'health_connect' && window.SteadyBridge ? `
              <div class="flex-row gap-8">
                <button class="btn btn-secondary btn-sm" id="set-hc-sync">🔄 今すぐ同期</button>
                ${App.healthProvider.getStatus() === 'permission_denied' ? `
                  <button class="btn btn-warning btn-sm" id="set-hc-permission">🔐 権限を許可</button>
                ` : ''}
              </div>
            ` : ''}
          </div>

          <!-- クラウド同期（端末ローカル） -->
          <div class="card mb-16">
            <h3 class="mb-16">☁️ クラウド同期 <span class="text-xs text-muted">（端末設定）</span></h3>
            <div class="form-group">
              <div class="form-label">GASウェブアプリURL</div>
              <input type="text" class="form-input" id="set-gas-url" value="${settings.gasSyncUrl || ''}" placeholder="https://script.google.com/macros/s/...">
              <div class="text-xs text-muted mt-4">
                スプレッドシート（Google Apps Script）で発行したURLを入力してください。<br>
                設定済みの場合は、アプリ起動時に自動で同期されます。
              </div>
            </div>
            <button class="btn btn-secondary btn-block" id="gas-sync-btn">🔄 クラウドと手動同期</button>
          </div>

          <!-- 通知設定（共有設定） -->
          <div class="card mb-16">
            <h3 class="mb-16">🔔 通知 <span class="text-xs text-muted">（共有設定）</span></h3>
            <div class="flex-between mb-12">
              <div>
                <div class="text-sm fw-500">準備通知（21:30）</div>
                <div class="text-xs text-muted">ジムの準備を促す通知</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="set-notif-prep" ${settings.notifPrep ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="flex-between mb-12">
              <div>
                <div class="text-sm fw-500">判定通知（22:00）</div>
                <div class="text-xs text-muted">体調チェックを促す通知</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="set-notif-judge" ${settings.notifJudge ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="flex-between">
              <div>
                <div class="text-sm fw-500">再開促し</div>
                <div class="text-xs text-muted">3日以上空いた時に提案</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="set-notif-resume" ${settings.notifResume !== false ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <button class="btn btn-primary btn-block" id="save-settings-btn">💾 設定を保存</button>

          <div class="divider mt-20"></div>

          <!-- データ管理 -->
          <div class="section mt-20">
            <div class="section-title">データ管理</div>
            
            <button class="btn btn-secondary btn-block mb-8" id="export-btn">
              📤 データをエクスポート (JSON)
            </button>
            
            <button class="btn btn-secondary btn-block mb-8" id="import-btn">
              📥 データをインポート
            </button>
            <input type="file" id="import-file" accept=".json" style="display:none;">
            
            <button class="btn btn-secondary btn-block mb-8" id="sample-btn">
              📋 サンプルデータを投入
            </button>
            
            <button class="btn btn-danger btn-block" id="reset-btn">
              🗑️ すべてのデータを初期化
            </button>
          </div>

          <!-- バージョン情報 -->
          <div class="text-center text-muted text-xs mt-20" style="padding-bottom:20px;">
            <div>Steady — やさしい継続コーチ</div>
            <div>Version 2.0.0 (v49)</div>
            <div class="mt-8">📱 Health Connect連携 ＆ クラウド同期</div>
            <div class="mt-4">設定: 🔗 共有 = スプシ同期 ／ 📱 端末 = ローカルのみ</div>
          </div>
        </div>`;
    },

    init() {
      // Strictness slider
      const slider = document.getElementById('set-strictness');
      if (slider) {
        slider.addEventListener('input', () => {
          document.getElementById('strictness-value').textContent = slider.value + '%';
        });
      }

      // Save settings
      document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('save-settings-btn');
        btn.disabled = true;
        btn.textContent = '⏳ 保存中...';

        const settings = {
          weeklyGoal: parseInt(document.getElementById('set-weekly-goal').value),
          sessionDuration: parseInt(document.getElementById('set-session-duration').value),
          gymHoursStart: document.getElementById('set-gym-start').value,
          gymHoursEnd: document.getElementById('set-gym-end').value,
          strictness: parseInt(document.getElementById('set-strictness').value),
          healthProvider: document.getElementById('set-health-provider').value,
          gasSyncUrl: document.getElementById('set-gas-url').value,
          notifPrep: document.getElementById('set-notif-prep').checked,
          notifJudge: document.getElementById('set-notif-judge').checked,
          notifResume: document.getElementById('set-notif-resume').checked
        };

        // ★ localDeviceSettings: 端末固有設定はローカルDBのみに保存（スプシ同期しない）
        const localDeviceKeys = ['gasSyncUrl', 'healthProvider'];
        for (const key of localDeviceKeys) {
          await App.DB.setSetting(key, settings[key]);
        }

        // GAS Sync URLを即時反映
        if (App.Sync && App.Sync.SheetSyncManager) {
          App.Sync.SheetSyncManager.init(settings.gasSyncUrl);
        }

        // ★ sharedSettings: 共有設定はGAS成功後にのみローカル確定
        const sharedSettings = { ...settings };
        delete sharedSettings.gasSyncUrl;
        delete sharedSettings.healthProvider;

        const settingsUpdatedAt = new Date().toISOString();
        let syncOk = false;

        if (App.Sync && App.Sync.SheetSyncManager && App.Sync.SheetSyncManager.hasUrl()) {
          const pushPayload = {
            date: '_settings',
            updatedAt: settingsUpdatedAt,
            settings: sharedSettings
          };
          try {
            const res = await App.Sync.SheetSyncManager.pushData(pushPayload);
            syncOk = res && res.ok;
          } catch (e) {
            console.error('[Settings] Sync push error:', e);
          }
        }

        if (syncOk) {
          // ★ GAS成功後にローカル保存を確定
          for (const [key, value] of Object.entries(sharedSettings)) {
            await App.DB.setSetting(key, value);
          }
          await App.DB.setSetting('_settingsUpdatedAt', new Date().toISOString());
          await App.DB.setSetting('_lastSyncAt', new Date().toISOString());
          btn.disabled = false;
          btn.textContent = '💾 設定を保存';
          App.Utils.showToast('✅ 共有設定・端末設定を保存しました', 'success');
        } else if (!App.Sync?.SheetSyncManager?.hasUrl()) {
          // URL未設定 → sharedSettings は未保存 / 設定未完了として扱い、ローカル確定もしない
          btn.disabled = false;
          btn.textContent = '💾 設定を保存';
          App.Utils.showToast('⚠️ 端末設定のみ保存（共有設定は同期URL未設定のため未保存）', 'warning');
        } else {
          // GAS送信失敗 → ローカルにも保存しない（リバート防止）
          btn.disabled = false;
          btn.textContent = '💾 設定を保存';
          App.Utils.showToast('❌ 共有設定の保存に失敗しました（端末設定は保存済み）', 'error');
        }
        
        // プロバイダが変わった場合はリロードする
        if (currentProvider !== document.getElementById('set-health-provider').value) {
           setTimeout(() => location.reload(), 500);
        }
      });
      
      const currentProvider = document.getElementById('set-health-provider')?.value;

      // Health Connect Actions
      document.getElementById('set-hc-sync')?.addEventListener('click', () => {
        if (App.healthProvider.triggerSync) {
            App.Utils.showToast('同期をリクエストしました...', 'info', 2000);
            App.healthProvider.triggerSync(App.Utils.today());
        }
      });

      document.getElementById('set-hc-permission')?.addEventListener('click', () => {
        if (App.healthProvider.requestPermissions) {
            App.healthProvider.requestPermissions();
        }
      });

      // GAS Sync
      document.getElementById('gas-sync-btn')?.addEventListener('click', async () => {
        const url = document.getElementById('set-gas-url').value.trim();
        if (!url) {
           App.Utils.showToast('先にGASウェブアプリURLを入力して「設定を保存」してください', 'warning');
           return;
        }
        App.Utils.showToast('クラウドからデータをダウンロードしています...', 'info', 3000);
        // 一時的に設定して即同期
        App.Sync.SheetSyncManager.init(url);
        try {
          const res = await App.Sync.SheetSyncManager.syncAll();
          if (res && res.success) {
             App.Utils.showToast('クラウド同期が完了しました', 'success');
             setTimeout(() => App.navigate('home'), 1000);
          } else {
             App.Utils.showToast('通信失敗: ' + (res?.error || '不明なエラー'), 'error');
          }
        } catch (e) {
          App.Utils.showToast('同期エラー: ' + e.message, 'error');
        }
      });

      // Export
      document.getElementById('export-btn')?.addEventListener('click', async () => {
        const data = await App.DB.exportAll();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `steady-backup-${App.Utils.today()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.Utils.showToast('エクスポートしました', 'success');
      });

      // Import
      document.getElementById('import-btn')?.addEventListener('click', () => {
        document.getElementById('import-file').click();
      });

      document.getElementById('import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data.version) throw new Error('無効なファイル形式');
          await App.DB.importAll(data);
          App.Utils.showToast('インポートしました。画面を更新します...', 'success');
          setTimeout(() => App.navigate('home'), 1000);
        } catch (err) {
          App.Utils.showToast('インポートに失敗しました: ' + err.message, 'error');
        }
      });

      // Sample data
      document.getElementById('sample-btn')?.addEventListener('click', async () => {
        if (confirm('サンプルデータを投入しますか？既存データは保持されます。')) {
          await App.SampleData.load();
          setTimeout(() => App.navigate('home'), 500);
        }
      });

      // Reset
      document.getElementById('reset-btn')?.addEventListener('click', () => {
        const html = `
          <p class="text-secondary mb-16">すべてのデータを削除します。<br>この操作は元に戻せません。</p>
          <button class="btn btn-danger btn-block mb-8" id="confirm-reset-btn">🗑️ 初期化する</button>
          <button class="btn btn-secondary btn-block" onclick="App.Utils.closeModal()">キャンセル</button>
        `;
        App.Utils.showModal('⚠️ データの初期化', html);
        document.getElementById('confirm-reset-btn')?.addEventListener('click', async () => {
          await App.DB.clearAll();
          App.Utils.closeModal();
          App.Utils.showToast('データを初期化しました', 'info');
          setTimeout(() => location.reload(), 500);
        });
      });
    },

    destroy() {}
  };
})();
