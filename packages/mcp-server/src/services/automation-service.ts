import { v4 as uuid } from 'uuid';
import { AutomationRepository } from '../db/repositories/automation-repo.js';
import { ActivityRepository } from '../db/repositories/activity-repo.js';
import type { AutomationRule, AutomationTrigger, AutomationAction } from '../types/entities.js';

export interface EvaluationResult {
  rule_id: string;
  rule_name: string;
  action_type: AutomationAction;
  action_config: Record<string, unknown> | null;
  triggered: boolean;
  reason?: string;
}

export interface EvaluateRulesResult {
  event: string;
  rules_evaluated: number;
  rules_triggered: number;
  results: EvaluationResult[];
}

export class AutomationService {
  private automationRepo = new AutomationRepository();
  private activityRepo = new ActivityRepository();

  async createRule(
    projectId: string,
    name: string,
    trigger_event: AutomationTrigger,
    action_type: AutomationAction,
    condition?: string,
    action_config?: string,
  ): Promise<AutomationRule> {
    return this.automationRepo.create({
      id: uuid(),
      project_id: projectId,
      name,
      trigger_event,
      condition: condition ?? null,
      action_type,
      action_config: action_config ?? null,
      enabled: true,
    });
  }

  async listRules(projectId: string): Promise<AutomationRule[]> {
    return this.automationRepo.findByProject(projectId);
  }

  async deleteRule(id: string): Promise<void> {
    await this.automationRepo.delete(id);
  }

  async toggleRule(id: string): Promise<AutomationRule> {
    return this.automationRepo.toggle(id);
  }

  async evaluateRules(
    projectId: string,
    event: string,
    context: Record<string, unknown>,
  ): Promise<EvaluateRulesResult> {
    const rules = await this.automationRepo.findByTrigger(projectId, event);
    const results: EvaluationResult[] = [];

    for (const rule of rules) {
      let conditionMet = true;
      let reason: string | undefined;

      if (rule.condition) {
        try {
          const condition = JSON.parse(rule.condition) as Record<string, unknown>;
          for (const [key, expected] of Object.entries(condition)) {
            if (context[key] !== expected) {
              conditionMet = false;
              reason = `Condition not met: context.${key} (${String(context[key])}) !== ${String(expected)}`;
              break;
            }
          }
        } catch {
          conditionMet = false;
          reason = 'Failed to parse condition JSON';
        }
      }

      if (!conditionMet) {
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          action_type: rule.action_type,
          action_config: null,
          triggered: false,
          reason,
        });
        continue;
      }

      let parsedActionConfig: Record<string, unknown> | null = null;
      if (rule.action_config) {
        try {
          parsedActionConfig = JSON.parse(rule.action_config) as Record<string, unknown>;
        } catch {
          parsedActionConfig = null;
        }
      }

      results.push({
        rule_id: rule.id,
        rule_name: rule.name,
        action_type: rule.action_type,
        action_config: parsedActionConfig,
        triggered: true,
      });
    }

    const triggered = results.filter(r => r.triggered);

    if (triggered.length > 0) {
      await this.activityRepo.create({
        actor: 'system',
        action: 'automation_triggered',
        payload: {
          event,
          rules_triggered: triggered.map(r => r.rule_name),
          actions_taken: triggered.map(r => ({ type: r.action_type, config: r.action_config })),
        },
      });
    }

    return {
      event,
      rules_evaluated: rules.length,
      rules_triggered: triggered.length,
      results,
    };
  }
}
