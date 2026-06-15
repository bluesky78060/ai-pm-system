# ralph PRD 템플릿 사용 가이드

`/oh-my-claudecode:ralph` 가 "완료까지 멈추지 않는" 자율 루프를 돌릴 때 읽는 **작업 명세 파일**(`prd.json`) 작성용 템플릿입니다.

## 파일 구성

| 파일 | 용도 |
|------|------|
| `ralph-prd-template.json` | 빈 스캐폴드. 복사해서 채우는 시작점 |
| `ralph-prd-example.json` | 이 프로젝트 스택 기준 동작 예시 (작성법 시연) |
| `README-ralph-prd.md` | 본 문서 |

> ⚠️ ralph 스킬(`prd.json`)과 ralphthon 모드(`ralphthon-prd.json`)는 **스키마가 다릅니다**. 본 템플릿은 `/oh-my-claudecode:ralph` 용 `prd.json`(최상위 키 `userStories`) 기준입니다.

## 스키마

```jsonc
{
  "userStories": [
    {
      "id": "US-001",                    // 고유 ID (US-NNN 권장)
      "title": "한 줄 제목",
      "description": "스토리 설명 (왜/무엇)",
      "acceptanceCriteria": ["...", "..."], // 검증 가능한 기준 배열
      "priority": 1,                     // 숫자, 낮을수록 우선 (1 = 최우선)
      "passes": false,                   // 항상 false 로 시작
      "notes": "..."                     // 선택. ralph 가 완료/반려 시 자동 기록
    }
  ]
}
```

- 최상위 키는 반드시 **`userStories`** (배열). 누락 시 ralph 가 PRD 로 인식하지 못함
- `priority` 는 **숫자**이며 **오름차순이 실행 순서**. foundational 작업을 1번으로
- `passes` 누락 시 `false`, `priority` 누락 시 배열 인덱스+1 로 자동 보정됨
- `_` 접두사 메타 필드(`_template` 등)는 ralph 가 무시하므로 주석 용도로 안전

## acceptanceCriteria 작성 규칙 (가장 중요)

ralph 의 품질은 **기준이 얼마나 검증 가능한가**로 결정됩니다.

| ❌ 금지 (generic) | ✅ 권장 (testable) |
|------------------|-------------------|
| "Implementation is complete" | "pnpm --filter @ai-pm/mcp-server build 가 0 에러로 통과" |
| "Code works correctly" | "getTask('APS-1-1') 가 null 대신 객체 반환" |
| "Tests added" | "src/__tests__/x.test.ts 존재하고 vitest 전체 통과" |
| "잘 동작함" | "빈 title 입력 시 throw 없이 에러 메시지 반환" |

- 각 기준은 **명령 실행 또는 파일 확인으로 참/거짓 판정 가능**해야 함
- 한 스토리는 **한 iteration 에 완료 가능한 크기**로 분해
- 빌드/테스트/린트 통과를 마지막 기준으로 넣으면 회귀 방지에 효과적

## 실행 방법

```bash
# 1. 템플릿 복사 → 활성 PRD 위치로
cp .claude/templates/ralph-prd-template.json .omc/prd.json

# 2. .omc/prd.json 을 실제 작업에 맞게 편집 (userStories 채우기)

# 3. ralph 실행 — PRD 가 이미 있으면 그걸 사용하고, 없으면 scaffold 자동 생성
/oh-my-claudecode:ralph 입력 검증 기능 추가
```

- `.omc/prd.json` 이 이미 있으면 ralph 는 **scaffold 생성을 건너뛰고** 그대로 사용 → 우리가 만든 정밀한 기준이 적용됨
- 없으면 ralph 가 generic scaffold 를 만든 뒤 스스로 refine (품질이 낮을 수 있음)
- 따라서 **PRD 를 미리 작성해두는 것이 개입 최소화 + 품질 확보의 핵심**

### 실행 흐름

```
PRD 읽기 → priority 최소 & passes:false 스토리 선택
  → 구현(executor 위임) → acceptanceCriteria 전부 검증
  → 통과 시 passes:true + progress.txt 기록 → 다음 스토리
  → 전 스토리 passes:true → 리뷰어(architect/critic) 최종 검증
  → 통과 → /oh-my-claudecode:cancel 로 정리 후 종료
```

멈추는 조건: 블로커(자격증명/모호함) · 사용자 "stop" · 같은 이슈 3회 반복.

## 이 프로젝트(AI PM System) 워크플로우와의 관계

ralph 는 **6단계(구현) 내부의 실행 엔진**입니다. 프로젝트의 티켓-우선 워크플로우를 대체하지 않습니다.

```
티켓 발행(create_task) → start_work
  → [ ralph 가 prd.json 스토리들을 자율 구현·검증 ]   ← 여기서 사용
  → submit_test → 코드 리뷰 → approve_review → done
```

권장 매핑:
- **PRD 스토리 ↔ 티켓의 기능 명세(F-001 등)**: 플랜(`docs/01-plan/`)의 기능 항목을 그대로 userStories 로 옮기면 일관성 유지
- **acceptanceCriteria ↔ 플랜의 DoD/테스트 전략**: 5단계 플랜 리뷰에서 확정한 검증 기준을 재사용
- ralph 의 자동 리뷰어 통과는 **사전 점검**일 뿐, 프로젝트 규칙상 `submit_test`/`approve_review`(self-approval 금지) 단계는 별도로 거쳐야 함

> CRITICAL 영역(인증/DB 마이그레이션/결제/권한)은 ralph 자동 진행 대상이 아닙니다. `continuous-execution.md` 의 중단 예외에 해당하므로 사람 확인이 필요합니다.

## 참조

- 스킬 정의: `~/.claude/plugins/.../skills/ralph/SKILL.md`
- 연속 실행 원칙: `.claude/rules/continuous-execution.md`
- 플랜 작성: `.claude/rules/discovery-and-plan.md`
- 코드 리뷰 강도: `.claude/rules/code-review.md`
