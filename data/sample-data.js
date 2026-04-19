// ============================================
// Steady — サンプルデータ
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  const today = new Date();
  const dateStr = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  App.SampleData = {
    async load() {
      // --- 勤務表（2週間分） ---
      const schedules = [
        { date: dateStr(-13), shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-12), shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-11), shiftType: 'late',   startTime: '13:00', endTime: '22:00' },
        { date: dateStr(-10), shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-9),  shiftType: 'normal', startTime: '10:00', endTime: '19:00' },
        { date: dateStr(-8),  shiftType: 'off',    startTime: '',      endTime: '' },
        { date: dateStr(-7),  shiftType: 'off',    startTime: '',      endTime: '' },
        { date: dateStr(-6),  shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-5),  shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-4),  shiftType: 'early',  startTime: '07:00', endTime: '16:00' },
        { date: dateStr(-3),  shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(-2),  shiftType: 'late',   startTime: '13:00', endTime: '22:00' },
        { date: dateStr(-1),  shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(0),   shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(1),   shiftType: 'off',    startTime: '',      endTime: '' },
        { date: dateStr(2),   shiftType: 'off',    startTime: '',      endTime: '' },
        { date: dateStr(3),   shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(4),   shiftType: 'normal', startTime: '10:00', endTime: '19:00' },
        { date: dateStr(5),   shiftType: 'early',  startTime: '07:00', endTime: '16:00' },
        { date: dateStr(6),   shiftType: 'normal', startTime: '09:00', endTime: '18:00' },
        { date: dateStr(7),   shiftType: 'late',   startTime: '13:00', endTime: '22:00' }
      ];
      await App.DB.bulkUpsertSchedules(schedules);

      // --- 健康データ ---
      const healthData = [
        { date: dateStr(-6), source: 'manual', steps: 8432, sleepMinutes: 420, heartRateAvg: 72, restingHeartRate: 62, calories: 2100, activeMinutes: 45, weight: 75.2 },
        { date: dateStr(-5), source: 'manual', steps: 6120, sleepMinutes: 390, heartRateAvg: 74, restingHeartRate: 63, calories: 1950, activeMinutes: 30, weight: 75.0 },
        { date: dateStr(-4), source: 'manual', steps: 10250, sleepMinutes: 450, heartRateAvg: 70, restingHeartRate: 60, calories: 2300, activeMinutes: 60, weight: 74.8 },
        { date: dateStr(-3), source: 'manual', steps: 7800, sleepMinutes: 380, heartRateAvg: 73, restingHeartRate: 64, calories: 2050, activeMinutes: 35, weight: 74.9 },
        { date: dateStr(-2), source: 'manual', steps: 5300, sleepMinutes: 350, heartRateAvg: 76, restingHeartRate: 66, calories: 1850, activeMinutes: 20, weight: 75.1 },
        { date: dateStr(-1), source: 'manual', steps: 9100, sleepMinutes: 410, heartRateAvg: 71, restingHeartRate: 61, calories: 2200, activeMinutes: 50, weight: 74.7 },
        { date: dateStr(0),  source: 'manual', steps: 7200, sleepMinutes: 400, heartRateAvg: 72, restingHeartRate: 62, calories: 2000, activeMinutes: 40, weight: 74.5 }
      ];
      for (const h of healthData) {
        await App.DB.upsertHealth(h);
      }

      // --- 体調データ ---
      const conditions = [
        { date: dateStr(-6), fatigue: 2, muscleSoreness: 1, motivation: 4, mood: 4 },
        { date: dateStr(-5), fatigue: 3, muscleSoreness: 2, motivation: 3, mood: 3 },
        { date: dateStr(-4), fatigue: 2, muscleSoreness: 0, motivation: 5, mood: 4 },
        { date: dateStr(-3), fatigue: 3, muscleSoreness: 3, motivation: 3, mood: 3 },
        { date: dateStr(-2), fatigue: 4, muscleSoreness: 2, motivation: 2, mood: 2 },
        { date: dateStr(-1), fatigue: 2, muscleSoreness: 1, motivation: 4, mood: 4 },
        { date: dateStr(0),  fatigue: 3, muscleSoreness: 1, motivation: 3, mood: 3 }
      ];
      for (const c of conditions) {
        await App.DB.upsertCondition(c);
      }

      // --- ワークアウト ---
      const w1id = await App.DB.saveWorkout({
        date: dateStr(-6), startTime: '22:10', endTime: '22:55',
        type: 'full', feeling: 4, memo: '調子良かった'
      });
      await App.DB.saveExercises(w1id, [
        { name: 'トレッドミル', sets: [{ setNumber: 1, weight: 0, reps: 0, completed: true }], durationMin: 5 },
        { name: 'レッグプレス', sets: [{ setNumber: 1, weight: 20, reps: 10, completed: true }, { setNumber: 2, weight: 20, reps: 10, completed: true }] },
        { name: 'チェストプレス', sets: [{ setNumber: 1, weight: 10, reps: 10, completed: true }, { setNumber: 2, weight: 10, reps: 8, completed: true }] },
        { name: 'ラットプルダウン', sets: [{ setNumber: 1, weight: 15, reps: 10, completed: true }, { setNumber: 2, weight: 15, reps: 10, completed: true }] },
        { name: 'アブベンチ', sets: [{ setNumber: 1, weight: 0, reps: 10, completed: true }, { setNumber: 2, weight: 0, reps: 10, completed: true }] }
      ]);

      const w2id = await App.DB.saveWorkout({
        date: dateStr(-4), startTime: '22:05', endTime: '22:45',
        type: 'full', feeling: 5, memo: '早番だったので元気'
      });
      await App.DB.saveExercises(w2id, [
        { name: 'トレッドミル', sets: [{ setNumber: 1, weight: 0, reps: 0, completed: true }], durationMin: 5 },
        { name: 'レッグプレス', sets: [{ setNumber: 1, weight: 25, reps: 10, completed: true }, { setNumber: 2, weight: 25, reps: 10, completed: true }] },
        { name: 'チェストプレス', sets: [{ setNumber: 1, weight: 10, reps: 10, completed: true }, { setNumber: 2, weight: 10, reps: 10, completed: true }] },
        { name: 'ラットプルダウン', sets: [{ setNumber: 1, weight: 15, reps: 10, completed: true }, { setNumber: 2, weight: 15, reps: 12, completed: true }] },
        { name: 'ショルダープレス', sets: [{ setNumber: 1, weight: 5, reps: 10, completed: true }, { setNumber: 2, weight: 5, reps: 10, completed: true }] },
        { name: 'アブベンチ', sets: [{ setNumber: 1, weight: 0, reps: 12, completed: true }, { setNumber: 2, weight: 0, reps: 12, completed: true }] }
      ]);

      const w3id = await App.DB.saveWorkout({
        date: dateStr(-1), startTime: '22:15', endTime: '22:40',
        type: 'short', feeling: 3, memo: '少し疲れていたので短縮'
      });
      await App.DB.saveExercises(w3id, [
        { name: 'レッグプレス', sets: [{ setNumber: 1, weight: 25, reps: 10, completed: true }, { setNumber: 2, weight: 25, reps: 10, completed: true }] },
        { name: 'チェストプレス', sets: [{ setNumber: 1, weight: 10, reps: 10, completed: true }, { setNumber: 2, weight: 12.5, reps: 8, completed: true }] },
        { name: 'ラットプルダウン', sets: [{ setNumber: 1, weight: 17.5, reps: 10, completed: true }, { setNumber: 2, weight: 17.5, reps: 8, completed: true }] }
      ]);

      // --- 判定履歴 ---
      const judgments = [
        { date: dateStr(-6), score: 82, result: 1, resultLabel: '通常メニュー', reasons: ['お休みの日で余裕があります', '十分な睡眠が取れています'], message: '体調も良好で、トレーニング日和です！', userOverride: null },
        { date: dateStr(-5), score: 58, result: 2, resultLabel: '短縮メニュー', reasons: ['睡眠がやや短め', 'やや疲労感があります'], message: '少し疲れていますが、短めなら大丈夫です。', userOverride: 5 },
        { date: dateStr(-4), score: 90, result: 1, resultLabel: '通常メニュー', reasons: ['十分な睡眠が取れています', '適度な間隔が空いています', 'やる気が高いです！'], message: 'コンディション良好。いつものメニューでOK！', userOverride: null },
        { date: dateStr(-3), score: 52, result: 2, resultLabel: '短縮メニュー', reasons: ['筋肉痛があります', 'やや疲労感があります'], message: '主要な種目だけサクッとやりましょう。', userOverride: null },
        { date: dateStr(-2), score: 28, result: 4, resultLabel: '家で軽いストレッチ', reasons: ['遅番のため時間が限られます', '睡眠不足気味', '強い疲労を感じています'], message: '今日は自宅で軽いストレッチがおすすめです。', userOverride: null },
        { date: dateStr(-1), score: 72, result: 2, resultLabel: '短縮メニュー', reasons: ['十分な睡眠が取れています', '疲労感は少なめです'], message: '少し疲れていますが、短めなら大丈夫です。', userOverride: 1 }
      ];
      for (const j of judgments) {
        await App.DB.upsertJudgment(j);
      }

      // --- 設定 ---
      await App.DB.setSetting('weeklyGoal', 3);
      await App.DB.setSetting('sessionDuration', 40);
      await App.DB.setSetting('gymHoursStart', '22:00');
      await App.DB.setSetting('gymHoursEnd', '24:00');
      await App.DB.setSetting('healthProvider', 'manual');
      await App.DB.setSetting('onboardingDone', true);

      console.log('[SampleData] サンプルデータを投入しました');
      App.Utils.showToast('サンプルデータを投入しました', 'success');
    }
  };
})();
