import { getPool } from '../db/connection.js';
import { randomUUID } from 'crypto';

const ALLOWED_EVENT_TYPES = ['status_change', 'task_blocked', 'task_stale', 'pr_merged', 'test_complete'] as const;

export interface NotificationCondition {
  priority?: number[]; // 특정 우선순위만
  assignee?: string[]; // 특정 담당자만
  statusChange?: string[]; // 특정 상태 변경만
  maxDaysInProgress?: number; // 지연 태스크 감지 기준 (days)
}

export interface NotificationSetting {
  id: string;
  user_id: string;
  event_type: 'status_change' | 'task_blocked' | 'task_stale' | 'pr_merged' | 'test_complete';
  enabled: boolean;
  conditions?: NotificationCondition;
  created_at: string;
  updated_at: string;
}

/**
 * 사용자별 알림 설정을 관리하는 서비스
 */
export class NotificationSettingsService {
  /**
   * 사용자의 모든 알림 설정 조회
   */
  async getSettings(userId: string): Promise<NotificationSetting[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, event_type, enabled, conditions, created_at, updated_at
       FROM notification_settings
       WHERE user_id = $1
       ORDER BY event_type ASC`,
      [userId]
    );

    return result.rows.map(row => ({
      ...row,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
    }));
  }

  /**
   * 특정 이벤트 타입의 알림 설정 조회
   */
  async getSetting(userId: string, eventType: string): Promise<NotificationSetting | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, event_type, enabled, conditions, created_at, updated_at
       FROM notification_settings
       WHERE user_id = $1 AND event_type = $2`,
      [userId, eventType]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
    };
  }

  /**
   * 알림 설정 생성 또는 업데이트
   */
  async updateSetting(
    userId: string,
    eventType: string,
    enabled: boolean,
    conditions?: NotificationCondition
  ): Promise<NotificationSetting> {
    if (!ALLOWED_EVENT_TYPES.includes(eventType as any)) {
      throw new Error(`Invalid event type: ${eventType}. Allowed: ${ALLOWED_EVENT_TYPES.join(', ')}`);
    }

    const pool = getPool();
    const id = randomUUID();
    const now = new Date().toISOString();

    const conditionsJson = conditions ? JSON.stringify(conditions) : null;

    // UPSERT: INSERT ... ON CONFLICT DO UPDATE
    const result = await pool.query(
      `INSERT INTO notification_settings (id, user_id, event_type, enabled, conditions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, event_type)
       DO UPDATE SET enabled = $4, conditions = $5, updated_at = $7
       RETURNING id, user_id, event_type, enabled, conditions, created_at, updated_at`,
      [id, userId, eventType, enabled, conditionsJson, now, now]
    );

    const row = result.rows[0];
    return {
      ...row,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
    };
  }

  /**
   * 사용자의 기본 알림 설정 초기화 (처음 사용자 추가 시)
   */
  async initializeDefaults(userId: string): Promise<void> {
    const pool = getPool();
    const eventTypes = ['status_change', 'task_blocked', 'task_stale', 'pr_merged', 'test_complete'];
    const now = new Date().toISOString();

    for (const eventType of eventTypes) {
      const id = randomUUID();
      try {
        await pool.query(
          `INSERT INTO notification_settings (id, user_id, event_type, enabled, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, event_type) DO NOTHING`,
          [id, userId, eventType, true, now, now]
        );
      } catch (err) {
        // 무시: 이미 존재하면 ON CONFLICT DO NOTHING으로 처리됨
      }
    }
  }

  /**
   * 특정 알림이 사용자에게 활성화되어 있는지 확인
   */
  async isEnabled(userId: string, eventType: string): Promise<boolean> {
    const setting = await this.getSetting(userId, eventType);
    if (!setting) {
      // 설정이 없으면 기본값 true (활성화)
      return true;
    }
    return setting.enabled;
  }

  /**
   * 조건을 검토하고 알림을 보낼지 결정
   */
  async shouldNotify(
    userId: string,
    eventType: string,
    context: {
      priority?: number;
      assignee?: string;
      previousStatus?: string;
      newStatus?: string;
      daysInProgress?: number;
    }
  ): Promise<boolean> {
    // 먼저 알림이 활성화되어 있는지 확인
    const enabled = await this.isEnabled(userId, eventType);
    if (!enabled) return false;

    // 설정 조건이 있으면 검토
    const setting = await this.getSetting(userId, eventType);
    if (!setting || !setting.conditions) {
      return true; // 조건이 없으면 무조건 발송
    }

    const cond = setting.conditions;

    // 우선순위 필터
    if (cond.priority && context.priority !== undefined) {
      if (!cond.priority.includes(context.priority)) {
        return false;
      }
    }

    // 담당자 필터
    if (cond.assignee && context.assignee) {
      if (!cond.assignee.includes(context.assignee)) {
        return false;
      }
    }

    // 상태 변경 필터
    if (cond.statusChange && context.previousStatus && context.newStatus) {
      const change = `${context.previousStatus}->${context.newStatus}`;
      if (!cond.statusChange.includes(change)) {
        return false;
      }
    }

    // 지연 태스크 기준 필터
    if (cond.maxDaysInProgress && context.daysInProgress !== undefined) {
      if (context.daysInProgress < cond.maxDaysInProgress) {
        return false;
      }
    }

    return true;
  }
}

// 싱글톤 인스턴스
export const notificationSettingsService = new NotificationSettingsService();
