---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
  - "packages/**/*.css"
---

# 에이전트 유형 × bkit 스킬 매핑 (필수 준수)

| 작업 유형 | 에이전트 | 모델 | bkit 스킬 |
|-----------|----------|------|-----------|
| 백엔드 API/로직 | `executor` | sonnet | `/phase-4-api` |
| 복잡한 백엔드 | `executor-high` | opus | `/phase-4-api` |
| UI 컴포넌트 | `designer` | sonnet | `/phase-5-design-system` |
| 복잡한 UI 시스템 | `designer-high` | opus | `/phase-5-design-system` |
| 간단한 수정 | `executor-low` | haiku | — |
| 문서 작성 | `writer` | haiku | `/pdca` |
| 코드 탐색 | `explore-medium` | sonnet | — |
| 보안 검토 | `security-reviewer` | opus | `/security-review` |
| 빌드 에러 | `build-fixer` | sonnet | `/build-fix` |

## 병렬 실행 원칙 (강화)

### 기본 원칙
- 독립 파일/기능은 동시 실행, 의존성 있는 작업은 순차 실행
- **파일 충돌 방지**: 동일 파일을 여러 에이전트가 동시 수정 금지
- 각 에이전트는 자신의 작업 완료 후 결과를 메인 오케스트레이터에 보고

### 병렬화 가능 패턴 (적극 적용)

| 시나리오 | 권장 |
|---------|------|
| **코드 리뷰 다중 라운드** | 1차/2차/3차를 **단일 메시지에서 병렬 dispatch** (1차 통과 대기 X) |
| **TDD 단순 패턴** | T4(테스트) + T5(구현) 동시 위임 가능 (구현 후 테스트로 검증) |
| **Phase 4 문서 작업** | CLAUDE.md / rules / README 동시 dispatch (각각 다른 파일) |
| **레이어별 풀스택** | DB + API + UI 각 레이어 다른 파일 → 동시 위임 |
| **빌드 + 테스트 + 린트** | 같은 코드에 대해 동시 실행 (각각 독립적) |

### 순차 필수 패턴 (병렬 금지)

- 동일 파일 수정 (예: `index.ts`에 도구 등록 + 다른 도구 추가)
- 의존성 있는 작업 (T5 서비스 → T6 도구 등록)
- request_changes → submit_test (상태 전환 의존)

### 단일 메시지 다중 dispatch 예시

```
# 코드 리뷰 2중 검증 — 병렬
[Agent 1: code-reviewer]
[Agent 2: security-reviewer]
→ 두 결과를 동시 수신 후 종합 판단

# 풀스택 위임 — 병렬
[Agent 1: executor-high → DB 마이그레이션]
[Agent 2: executor → API 라우트]
[Agent 3: designer → React 컴포넌트]
→ 3개 결과 수신 후 메인이 통합
```

**효과**: 리뷰 라운드 60% 단축, T4+T5 병렬 시 50% 단축.
