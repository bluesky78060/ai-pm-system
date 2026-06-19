import type { Task } from '../types/index.js';
import { notificationSettingsService } from './notification-settings-service.js';

interface SlackMessage {
	text: string;
	blocks?: Array<{
		type: string;
		text?: { type: string; text: string };
		fields?: Array<{ type: string; text: string }>;
	}>;
}

interface NotificationContext {
	task: Task;
	previousStatus?: string;
	newStatus?: string;
	notes?: string;
	testResults?: unknown;
	reviewNotes?: string;
	prUrl?: string;
	durationSeconds?: number;
	extra?: Record<string, unknown>;
}

/**
 * Slack 알림 서비스
 *
 * 알림 조건:
 * - 태스크 상태 변경 (특히 done, blocked)
 * - 블로킹된 태스크 발생
 * - 7일 이상 in_progress 상태인 태스크 (지연)
 * - PR 병합 완료
 */
export class NotificationService {
	private webhookUrl: string | undefined;
	private enabled: boolean;
	private retryCount = 3;
	private retryDelay = 1000; // ms

	// 중복 알림 방지용 캐시 (메모리 기반, 서버 재시작 시 초기화)
	private recentNotifications: Map<string, number> = new Map();
	private deduplicationWindow = 5 * 60 * 1000; // 5분

	constructor() {
		this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
		this.enabled = Boolean(this.webhookUrl);
	}

	/**
	 * 태스크 상태 변경 알림
	 */
	async notifyStatusChange(context: NotificationContext): Promise<void> {
		if (!this.enabled) return;

		const { task, previousStatus, newStatus, notes, extra } = context;

		// 중복 알림 방지
		const key = `status_${task.id}_${previousStatus}_${newStatus}`;
		if (this.isDuplicate(key)) return;

		// 알림 조건: done, blocked, testing→review 전환
		const shouldNotify =
			newStatus === 'done' ||
			newStatus === 'blocked' ||
			(previousStatus === 'testing' && newStatus === 'review');

		if (!shouldNotify) return;

		// 사용자 설정 확인 (기본 담당자는 'ai')
		const userId = task.assignee || 'ai';
		const eventType = newStatus === 'blocked' ? 'task_blocked' : 'status_change';
		const settingsCheck = await notificationSettingsService.shouldNotify(userId, eventType, {
			priority: task.priority,
			assignee: task.assignee,
			previousStatus,
			newStatus,
		});

		if (!settingsCheck) return;

		let emoji = '📝';
		let title = '태스크 상태 변경';

		if (newStatus === 'done') {
			emoji = '🎉';
			title = '태스크 완료';
		} else if (newStatus === 'blocked') {
			emoji = '🚨';
			title = '태스크 블로킹 발생';
		} else if (newStatus === 'review') {
			emoji = '👀';
			title = '코드 리뷰 필요';
		}

		const fields: Array<{ type: string; text: string }> = [
			{ type: 'mrkdwn', text: `*티켓:*\n${task.ticket_code || task.id}` },
			{ type: 'mrkdwn', text: `*제목:*\n${task.title}` },
			{ type: 'mrkdwn', text: `*담당자:*\n${task.assignee || 'unassigned'}` },
			{ type: 'mrkdwn', text: `*상태:*\n${previousStatus} → ${newStatus}` },
		];

		if (notes) {
			fields.push({ type: 'mrkdwn', text: `*메모:*\n${notes}` });
		}

		// 추가 컨텍스트
		if (extra?.epic_progress) {
			const ep = extra.epic_progress as { total: number; completed: number; rate: number };
			fields.push({
				type: 'mrkdwn',
				text: `*에픽 진행률:*\n${ep.completed}/${ep.total} (${ep.rate}%)`,
			});
		}

		if (newStatus === 'blocked' && extra?.blocked_from) {
			fields.push({ type: 'mrkdwn', text: `*블로킹 전 상태:*\n${extra.blocked_from}` });
		}

		const message: SlackMessage = {
			text: `${emoji} ${title}: ${task.title}`,
			blocks: [
				{
					type: 'header',
					text: { type: 'plain_text', text: `${emoji} ${title}` },
				},
				{
					type: 'section',
					fields,
				},
			],
		};

		await this.sendMessage(message);
		this.markSent(key);
	}

	/**
	 * 지연 태스크 알림 (7일 이상 in_progress)
	 */
	async notifyStaleTask(task: Task, daysInProgress: number): Promise<void> {
		if (!this.enabled) return;
		if (daysInProgress < 7) return;

		const key = `stale_${task.id}_${daysInProgress}`;
		if (this.isDuplicate(key)) return;

		// 사용자 설정 확인
		const userId = task.assignee || 'ai';
		const settingsCheck = await notificationSettingsService.shouldNotify(userId, 'task_stale', {
			priority: task.priority,
			assignee: task.assignee,
			daysInProgress,
		});

		if (!settingsCheck) return;

		const message: SlackMessage = {
			text: `⏰ 지연된 태스크: ${task.title}`,
			blocks: [
				{
					type: 'header',
					text: { type: 'plain_text', text: '⏰ 지연된 태스크 발견' },
				},
				{
					type: 'section',
					fields: [
						{ type: 'mrkdwn', text: `*티켓:*\n${task.ticket_code || task.id}` },
						{ type: 'mrkdwn', text: `*제목:*\n${task.title}` },
						{ type: 'mrkdwn', text: `*담당자:*\n${task.assignee || 'unassigned'}` },
						{ type: 'mrkdwn', text: `*in_progress 경과:*\n${daysInProgress}일` },
					],
				},
			],
		};

		await this.sendMessage(message);
		this.markSent(key);
	}

	/**
	 * PR 병합 완료 알림
	 */
	async notifyPrMerged(task: Task, prUrl: string): Promise<void> {
		if (!this.enabled) return;

		const key = `pr_merged_${task.id}_${prUrl}`;
		if (this.isDuplicate(key)) return;

		// 사용자 설정 확인
		const userId = task.assignee || 'ai';
		const settingsCheck = await notificationSettingsService.shouldNotify(userId, 'pr_merged', {
			priority: task.priority,
			assignee: task.assignee,
		});

		if (!settingsCheck) return;

		const message: SlackMessage = {
			text: `✅ PR 병합 완료: ${task.title}`,
			blocks: [
				{
					type: 'header',
					text: { type: 'plain_text', text: '✅ PR 병합 완료' },
				},
				{
					type: 'section',
					fields: [
						{ type: 'mrkdwn', text: `*티켓:*\n${task.ticket_code || task.id}` },
						{ type: 'mrkdwn', text: `*제목:*\n${task.title}` },
						{ type: 'mrkdwn', text: `*PR:*\n<${prUrl}|View PR>` },
					],
				},
			],
		};

		await this.sendMessage(message);
		this.markSent(key);
	}

	/**
	 * 테스트 완료 알림 (testing → review 전환 시)
	 */
	async notifyTestComplete(
		task: Task,
		testResults?: { build?: string; test?: string },
	): Promise<void> {
		if (!this.enabled) return;

		const key = `test_complete_${task.id}`;
		if (this.isDuplicate(key)) return;

		// 사용자 설정 확인
		const userId = task.assignee || 'ai';
		const settingsCheck = await notificationSettingsService.shouldNotify(userId, 'test_complete', {
			priority: task.priority,
			assignee: task.assignee,
		});

		if (!settingsCheck) return;

		const fields: Array<{ type: string; text: string }> = [
			{ type: 'mrkdwn', text: `*티켓:*\n${task.ticket_code || task.id}` },
			{ type: 'mrkdwn', text: `*제목:*\n${task.title}` },
		];

		if (testResults?.build) {
			fields.push({
				type: 'mrkdwn',
				text: `*빌드:*\n\`\`\`${this.truncate(testResults.build, 100)}\`\`\``,
			});
		}

		if (testResults?.test) {
			fields.push({
				type: 'mrkdwn',
				text: `*테스트:*\n\`\`\`${this.truncate(testResults.test, 100)}\`\`\``,
			});
		}

		const message: SlackMessage = {
			text: `✅ 테스트 완료: ${task.title}`,
			blocks: [
				{
					type: 'header',
					text: { type: 'plain_text', text: '✅ 테스트 완료 - 리뷰 필요' },
				},
				{
					type: 'section',
					fields,
				},
			],
		};

		await this.sendMessage(message);
		this.markSent(key);
	}

	/**
	 * Slack 웹훅으로 메시지 전송 (재시도 로직 포함)
	 */
	private async sendMessage(message: SlackMessage): Promise<void> {
		if (!this.webhookUrl) return;

		for (let attempt = 1; attempt <= this.retryCount; attempt++) {
			try {
				const response = await fetch(this.webhookUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(message),
				});

				if (response.ok) {
					return; // 성공
				}

				// 재시도 가능한 에러 (5xx)
				if (response.status >= 500 && attempt < this.retryCount) {
					await this.delay(this.retryDelay * attempt);
					continue;
				}

				// 재시도 불가능한 에러 (4xx)
				console.error(
					`[NotificationService] Slack webhook error: ${response.status} ${response.statusText}`,
				);
				return;
			} catch (error) {
				if (attempt < this.retryCount) {
					await this.delay(this.retryDelay * attempt);
					continue;
				}
				console.error('[NotificationService] Failed to send Slack notification:', error);
			}
		}
	}

	/**
	 * 중복 알림 체크
	 */
	private isDuplicate(key: string): boolean {
		const lastSent = this.recentNotifications.get(key);
		if (!lastSent) return false;

		const elapsed = Date.now() - lastSent;
		return elapsed < this.deduplicationWindow;
	}

	/**
	 * 전송 완료 마킹
	 */
	private markSent(key: string): void {
		this.recentNotifications.set(key, Date.now());

		// 주기적으로 오래된 항목 정리 (메모리 누수 방지)
		if (this.recentNotifications.size > 1000) {
			const cutoff = Date.now() - this.deduplicationWindow;
			for (const [k, timestamp] of this.recentNotifications.entries()) {
				if (timestamp < cutoff) {
					this.recentNotifications.delete(k);
				}
			}
		}
	}

	/**
	 * 문자열 자르기 (긴 출력 방지)
	 */
	private truncate(text: string, maxLength: number): string {
		if (text.length <= maxLength) return text;
		return `${text.substring(0, maxLength)}...`;
	}

	/**
	 * 딜레이 헬퍼
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

// 싱글톤 인스턴스
export const notificationService = new NotificationService();
