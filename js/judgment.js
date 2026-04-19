// ============================================
// Steady — 当日判定エンジン
// ============================================
(function() {
  'use strict';
  window.App = window.App || {};

  const RESULT_LABELS = [
    '', // 0 unused
    '通常メニュー',
    '短縮メニュー',
    '有酸素のみ',
    '家で軽いストレッチ',
    '完全スキップ'
  ];

  const RESULT_ICONS = ['', '🏋️', '⚡', '🏃', '🧘', '😴'];

  const RESULT_MESSAGES = {
    1: [
      '体調も良好で、トレーニング日和です！',
      '十分な回復ができています。しっかりやりましょう！',
      'コンディション良好。いつものメニューでOK！'
    ],
    2: [
      '少し疲れていますが、短めなら大丈夫です。',
      '時間や体調を考慮して、ポイントを絞りましょう。',
      '主要な種目だけサクッとやりましょう。'
    ],
    3: [
      '体に負担の少ない有酸素で血行を良くしましょう。',
      '軽く動くことでリフレッシュできます。',
      'ウォーキングで軽く汗を流しましょう。'
    ],
    4: [
      '今日は自宅で軽いストレッチがおすすめです。',
      'ジムに行かなくても、体のケアはできます。',
      '5分のストレッチでも十分な効果があります。'
    ],
    5: [
      '今日はしっかり休みましょう。休養も大切な練習です。',
      '無理しないことが、長く続けるコツです。',
      '明日に向けてゆっくり回復しましょう。'
    ]
  };

  const Judgment = {
    RESULT_LABELS,
    RESULT_ICONS,

    /**
     * 当日判定を実行する
     * @param {Object} input - 判定入力データ
     * @returns {Object} { score, result, reasons, message, input }
     */
    async calculate(input = {}) {
      const {
        workEndTime = null,       // "HH:MM"
        nextStartTime = null,     // "HH:MM"
        availableMinutes = null,  // 利用可能時間（分）
        sleepMinutes = null,      // 睡眠時間（分）
        fatigue = 3,              // 1-5
        muscleSoreness = 0,       // 0-5
        motivation = 3,           // 1-5
        mood = 3,                 // 1-5
        heartRateAvg = null,      // bpm
        restingHeartRate = null,  // bpm
        steps = null,             // 歩数
        activeMinutes = null,     // 活動時間
        daysSinceLastWorkout = null,
        consecutiveTrainingDays = 0,
        shiftType = null,         // off, normal, early, late, night, remote
        note = '',                // 体調メモ（フリーテキスト）
      } = input;

      let score = 100;
      const reasons = [];

      // ===== 時間制約 =====
      
      // 利用可能時間
      if (availableMinutes != null) {
        if (availableMinutes < 20) {
          score -= 70;
          reasons.push('利用可能時間が20分未満です');
        } else if (availableMinutes < 40) {
          score -= 35;
          reasons.push('利用可能時間が短め（' + availableMinutes + '分）');
        } else if (availableMinutes < 60) {
          score -= 15;
          reasons.push('時間はやや限られます');
        }
      }

      // 仕事終了時刻
      if (workEndTime) {
        const endMin = App.Utils.timeToMinutes(workEndTime);
        if (endMin >= 23 * 60) {
          score -= 50;
          reasons.push('仕事終わりが23時以降と遅いです');
        } else if (endMin >= 22 * 60) {
          score -= 30;
          reasons.push('仕事終わりが22時台と遅めです');
        } else if (endMin >= 21 * 60) {
          score -= 10;
          reasons.push('仕事終わりは21時台');
        }
      }

      // 翌朝の勤務開始
      if (nextStartTime) {
        const startMin = App.Utils.timeToMinutes(nextStartTime);
        if (startMin <= 6 * 60) {
          score -= 30;
          reasons.push('翌朝6時以前開始と早いです');
        } else if (startMin <= 7 * 60) {
          score -= 15;
          reasons.push('翌朝が早め（' + nextStartTime + '）');
        }
      }

      // シフトタイプ
      if (shiftType === 'night') {
        score -= 40;
        reasons.push('夜勤のため無理は禁物です');
      } else if (shiftType === 'late') {
        score -= 15;
        reasons.push('遅番のため時間が限られます');
      } else if (shiftType === 'off') {
        score += 15;
        reasons.push('お休みの日で余裕があります');
      }

      // ===== 身体状態 =====
      
      // 睡眠
      if (sleepMinutes != null) {
        const sleepH = sleepMinutes / 60;
        if (sleepH < 4) {
          score -= 45;
          reasons.push('睡眠が非常に不足しています（' + sleepH.toFixed(1) + 'h）');
        } else if (sleepH < 5) {
          score -= 30;
          reasons.push('睡眠不足気味（' + sleepH.toFixed(1) + 'h）');
        } else if (sleepH < 6) {
          score -= 15;
          reasons.push('睡眠がやや短め（' + sleepH.toFixed(1) + 'h）');
        } else if (sleepH >= 7) {
          score += 10;
          reasons.push('十分な睡眠が取れています');
        }
      }

      // 疲労感
      if (fatigue >= 5) {
        score -= 35;
        reasons.push('強い疲労を感じています');
      } else if (fatigue >= 4) {
        score -= 20;
        reasons.push('やや疲労感があります');
      } else if (fatigue <= 1) {
        score += 5;
        reasons.push('疲労感は少なめです');
      }

      // 筋肉痛
      if (muscleSoreness >= 4) {
        score -= 25;
        reasons.push('筋肉痛が強めです');
      } else if (muscleSoreness >= 3) {
        score -= 10;
        reasons.push('筋肉痛があります');
      }

      // 心拍の異常
      if (restingHeartRate != null) {
        // 平均的な安静時心拍を60-75として、異常に高い場合
        if (restingHeartRate > 90) {
          score -= 25;
          reasons.push('安静時心拍が高め（' + restingHeartRate + 'bpm）');
        } else if (restingHeartRate > 80) {
          score -= 10;
          reasons.push('安静時心拍がやや高め');
        }
      }

      // ===== モチベーション =====
      if (motivation >= 5) {
        score += 10;
        reasons.push('やる気が高いです！');
      } else if (motivation >= 4) {
        score += 5;
      } else if (motivation <= 1) {
        score -= 5;
        reasons.push('気分が乗らない日もあります');
      }

      // 気分
      if (mood <= 1) {
        score -= 10;
        reasons.push('気分が優れません');
      } else if (mood >= 5) {
        score += 5;
      }

      // ===== トレーニング状況 =====
      if (daysSinceLastWorkout != null) {
        if (daysSinceLastWorkout >= 5) {
          score += 20;
          reasons.push('前回から' + daysSinceLastWorkout + '日空いています');
        } else if (daysSinceLastWorkout >= 3) {
          score += 10;
          reasons.push('適度な間隔が空いています');
        }
      }

      if (consecutiveTrainingDays >= 4) {
        score -= 25;
        reasons.push('連続' + consecutiveTrainingDays + '日トレーニング中です');
      } else if (consecutiveTrainingDays >= 3) {
        score -= 10;
        reasons.push('3日連続のため休息も検討');
      }

      // ===== 体調メモの解析 =====
      // ★ 軽度→中度→重度の順で判定（「風邪気味」が「風邪」にマッチしないよう）
      if (note && typeof note === 'string' && note.trim()) {
        const noteText = note.trim();
        // 軽度: 軽い注意（-15）— 先に判定して部分一致の誤マッチを防ぐ
        const mildKeywords = ['風邪気味', '少し痛', 'ちょっと', '微熱', '鼻水', '花粉', '寝不足'];
        // 中度: 大幅減点（-35）
        const moderateKeywords = ['風邪', '頭痛', '腹痛', '下痢', 'めまい', '吐き', '咳', '喉が痛', '体調不良', '具合が悪', '気持ち悪', 'だるい', '倦怠感', '寒気', '関節痛', '腰痛', '怪我', 'ケガ', '捻挫', '骨折'];
        // 重度: 即座にスキップ推奨（-60）
        const severeKeywords = ['熱がある', '発熱', '高熱', '嘔吐', '吐き気', '動けない', '入院'];

        let matched = false;
        // 軽度を先にチェック
        for (const kw of mildKeywords) {
          if (noteText.includes(kw)) {
            score -= 15;
            reasons.push('メモ: 「' + kw + '」— 様子を見ながら');
            matched = true;
            break;
          }
        }
        if (!matched) {
          for (const kw of moderateKeywords) {
            if (noteText.includes(kw)) {
              score -= 35;
              reasons.push('メモ: 「' + kw + '」— 体調優先で軽めに');
              matched = true;
              break;
            }
          }
        }
        if (!matched) {
          for (const kw of severeKeywords) {
            if (noteText.includes(kw)) {
              score -= 60;
              reasons.push('メモ: 「' + kw + '」— 無理せず休んでください');
              matched = true;
              break;
            }
          }
        }
      }

      // ===== 補助指標 =====
      if (steps != null) {
        if (steps > 15000) {
          score -= 5;
          reasons.push('今日は活動量が多めでした');
        } else if (steps < 3000) {
          score += 5;
          reasons.push('今日はデスクワーク中心でした');
        }
      }

      // スコアをクランプ
      score = App.Utils.clamp(Math.round(score), 0, 100);

      // 判定結果を決定
      let result;
      if (score >= 75) result = 1;      // 通常メニュー
      else if (score >= 55) result = 2;  // 短縮メニュー
      else if (score >= 35) result = 3;  // 有酸素のみ
      else if (score >= 15) result = 4;  // 軽いストレッチ
      else result = 5;                    // 完全スキップ

      // メッセージ選択
      const messages = RESULT_MESSAGES[result];
      const message = messages[Math.floor(Math.random() * messages.length)];

      return {
        score,
        result,
        resultLabel: RESULT_LABELS[result],
        resultIcon: RESULT_ICONS[result],
        reasons: reasons.filter(r => r),
        message,
        input,
        calculatedAt: new Date().toISOString()
      };
    },

    /**
     * 今日の判定に必要な入力データを自動収集する
     */
    async gatherInput(date) {
      const today = date || App.Utils.today();
      const health = await App.DB.getHealth(today);
      const condition = await App.DB.getCondition(today);
      const schedule = await App.DB.getSchedule(today);

      // 翌日の勤務
      const tomorrow = new Date(today + 'T00:00:00');
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);
      const nextSchedule = await App.DB.getSchedule(tomorrowStr);

      const daysSince = await App.DB.getDaysSinceLastWorkout(today);
      const consecutive = await App.DB.getConsecutiveTrainingDays(today);

      // 利用可能時間を計算
      let availableMinutes = null;
      if (schedule) {
        if (schedule.shiftType === 'off') {
          availableMinutes = 120;
        } else if (schedule.endTime) {
          const endMin = App.Utils.timeToMinutes(schedule.endTime);
          // 22:00到着前提で、24:00まで
          const gymStart = Math.max(endMin + 30, 22 * 60); // 退勤+30分 or 22:00
          availableMinutes = Math.max(0, 24 * 60 - gymStart);
        }
      }

      return {
        workEndTime: schedule?.endTime || null,
        nextStartTime: nextSchedule?.startTime || null,
        availableMinutes,
        sleepMinutes: health?.sleepMinutes ?? null,
        fatigue: condition?.fatigue ?? 3,
        muscleSoreness: condition?.muscleSoreness ?? 0,
        motivation: condition?.motivation ?? 3,
        mood: condition?.mood ?? 3,
        heartRateAvg: health?.heartRateAvg ?? null,
        restingHeartRate: health?.restingHeartRate ?? null,
        steps: health?.steps ?? null,
        activeMinutes: health?.activeMinutes ?? null,
        daysSinceLastWorkout: daysSince,
        consecutiveTrainingDays: consecutive,
        shiftType: schedule?.shiftType || null,
        note: condition?.note || ''
      };
    },

    /**
     * 判定を実行してDBに保存
     */
    async judgeAndSave(date, overrideInput = {}) {
      const input = await this.gatherInput(date);
      Object.assign(input, overrideInput);
      const result = await this.calculate(input);
      
      await App.DB.upsertJudgment({
        date: date || App.Utils.today(),
        score: result.score,
        result: result.result,
        resultLabel: result.resultLabel,
        reasons: result.reasons,
        message: result.message,
        inputData: result.input,
        userOverride: null,
        calculatedAt: result.calculatedAt
      });

      return result;
    },

    /** スコアに対応する色のCSS変数名 */
    getScoreColor(result) {
      return `var(--judge-${result})`;
    }
  };

  App.Judgment = Judgment;
})();
