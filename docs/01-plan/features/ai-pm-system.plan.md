# ai-pm-system Planning Document

> **Summary**: MCP 기반 AI 자율 개발 프로젝트 관리 시스템 - AI 에이전트가 태스크 CRUD, 테스트, 수정까지 자율 수행
>
> **Project**: ai-pm-system
> **Version**: v1.0
> **Author**: leechanhee
> **Date**: 2026-02-26
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

AI 에이전트(Claude Code, Cursor 등)가 MCP 프로토콜을 통해 개발 프로젝트를 자율적으로 관리할 수 있는 PM 플랫폼을 구축합니다. 사람의 개입 없이 AI가 태스크 생성, 분해, 우선순위 조정, 테스트 실행, 수정 루프, PR 생성까지 자율적으로 수행합니다.

### 1.2 Background

- 현재 AI 에이전트는 코드 작성 능력은 뛰어나지만, 프로젝트 관리(태스크 추적, 우선순위, 의존성)는 사람이 수동으로 관리
- MCP(Model Context Protocol)를 활용하면 AI가 구조화된 도구를 통해 프로젝트 상태를 읽고 쓸 수 있음
- 로컬 SQLite 기반으로 별도 서버 없이 즉시 실행 가능한 경량 솔루션 필요

### 1.3 Related Documents

- 설계 문서: IDE `Untitled-1` (초기 설계 명세)
- MCP SDK: `@modelcontextprotocol/sdk` 공식 문서

---

## 2. Scope

### 2.1 In Scope

- [ ] MCP 서버 구현 (15개 도구: 컨텍스트 3개, 태스크 관리 5개, GitHub 연동 4개, 테스트 5개)
- [ ] SQLite 데이터베이스 스키마 (projects, epics, tasks, task_dependencies, activity_log, test_runs, fix_attempts)
- [ ] AI 세션 컨텍스트 자동 제공 (get_session_context)
- [ ] AI 자율 테스트 & 수정 루프 (최대 3회 재시도, 에스컬레이션)
- [ ] GitHub PR/Issue 연동
- [ ] React + Vite 기반 웹 대시보드
- [ ] 4단계 태스크 계층 (Project → Epic → Task → Sub-task)
- [ ] pnpm 모노레포 구성 (mcp-server + web-ui)

### 2.2 Out of Scope

- 멀티 테넌트 / 클라우드 배포 (v1.0은 로컬 전용)
- 실시간 알림 (Slack, Email 등)
- AI 모델 학습 / 파인튜닝
- 다른 MCP 클라이언트(Cursor 등) 전용 최적화

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | MCP 도구를 통한 태스크 CRUD (create, read, update, delete) | High | Pending |
| FR-02 | AI 세션 시작 시 자동 컨텍스트 제공 (현재 태스크, 진행률, 블로킹 분석, 다음 권장) | High | Pending |
| FR-03 | 태스크 자동 분해 (decompose_task) 및 서브태스크 생성 | High | Pending |
| FR-04 | 우선순위 자율 조정 (priority + 의존성 기반) | Medium | Pending |
| FR-05 | 테스트 자동 실행 및 수정 루프 (최대 3회, 초과 시 에스컬레이션) | High | Pending |
| FR-06 | GitHub PR/Issue 연동 (link_pr_to_task, create_github_issue) | Medium | Pending |
| FR-07 | 커밋 진행률 자동 반영 (sync_commit_progress) | Medium | Pending |
| FR-08 | 블로킹 분석 및 해결 방안 자동 기록 | Medium | Pending |
| FR-09 | React 웹 대시보드 (프로젝트 현황, 태스크 뷰, 테스트 결과) | Medium | Pending |
| FR-10 | 활동 로그 기록 (AI/사람/GitHub 행위자 구분) | Low | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | MCP 도구 응답 시간 < 500ms | 도구 실행 시간 측정 |
| Performance | SQLite 쿼리 < 100ms (1000 태스크 기준) | 벤치마크 테스트 |
| Reliability | 데이터 무결성 보장 (트랜잭션, FK 제약) | SQLite PRAGMA foreign_keys |
| Portability | 별도 서버 없이 로컬 실행 | npm start로 즉시 실행 확인 |
| Maintainability | 모노레포 구조, 패키지 간 명확한 책임 분리 | 코드 리뷰 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 모든 MCP 도구 (15개) 구현 및 동작 확인
- [ ] Claude Code에서 MCP 도구 호출하여 태스크 CRUD 가능
- [ ] AI 세션 시작 시 get_session_context가 정확한 데이터 반환
- [ ] 테스트 → 수정 → 재테스트 루프가 자율적으로 동작
- [ ] 3회 실패 시 에스컬레이션 정상 동작
- [ ] Web 대시보드에서 프로젝트 현황 확인 가능
- [ ] GitHub PR 연동 정상 동작

### 4.2 Quality Criteria

- [ ] 단위 테스트 커버리지 80% 이상
- [ ] TypeScript strict 모드 통과
- [ ] ESLint 에러 0건
- [ ] 빌드 성공 (mcp-server + web-ui 모두)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SQLite 동시 접근 충돌 (MCP + Web UI) | High | Medium | WAL 모드 활성화, 읽기/쓰기 분리 |
| MCP SDK 버전 호환성 변경 | Medium | Medium | SDK 버전 고정, 릴리스 노트 추적 |
| 대규모 프로젝트에서 성능 저하 | Medium | Low | 인덱스 최적화, 페이지네이션 적용 |
| AI 수정 루프 무한 반복 | High | Low | 최대 3회 제한 + 에스컬레이션 정책 |
| GitHub API Rate Limit | Medium | Medium | 캐싱 + 조건부 요청 (ETag) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure (`components/`, `lib/`, `types/`) | Static sites, portfolios, landing pages | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs, fullstack apps | ☑ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems, complex architectures | ☐ |

> **선택 근거**: MCP 서버 + Web UI의 모노레포 구조, SQLite 데이터 레이어, GitHub API 연동 등 중간 규모 복잡도. Enterprise 수준의 DI/마이크로서비스까지는 불필요.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Runtime | Node.js / Deno / Bun | Node.js | MCP SDK 공식 지원, 생태계 성숙도 |
| MCP Framework | `@modelcontextprotocol/sdk` | `@modelcontextprotocol/sdk` | Claude Code 공식 지원 |
| Web Framework | React+Vite / Next.js / Vue | React + Vite | SPA 충분, SSR 불필요, 빠른 개발 |
| UI Components | shadcn/ui / MUI / Ant Design | shadcn/ui + Tailwind | 경량, 커스터마이징 용이 |
| Database | SQLite / PostgreSQL / JSON | SQLite (better-sqlite3) | 로컬 실행, 서버 불필요, 충분한 성능 |
| GitHub Client | Octokit / gh CLI / fetch | Octokit | 타입 안전, 공식 라이브러리 |
| Git Client | simple-git / isomorphic-git | simple-git | Node.js에서 안정적 |
| Package Manager | pnpm / npm / yarn | pnpm workspaces | 모노레포, 디스크 효율성 |
| Testing | Vitest / Jest | Vitest | Vite 에코시스템 통일 |
| Linting | ESLint + Biome | Biome | 빠른 속도, 통합 포매팅 |

### 6.3 Clean Architecture Approach

```
Selected Level: Dynamic

Folder Structure:
ai-pm-system/
├── packages/
│   ├── mcp-server/              # MCP 서버 패키지
│   │   ├── src/
│   │   │   ├── tools/           # MCP 도구 구현 (컨텍스트, 태스크, GitHub, 테스트)
│   │   │   ├── services/        # PM 비즈니스 로직 (TaskService, ProjectService 등)
│   │   │   ├── db/              # SQLite 연결, 마이그레이션, 쿼리
│   │   │   └── types/           # 공유 타입 정의
│   │   └── package.json
│   │
│   └── web-ui/                  # React 대시보드
│       ├── src/
│       │   ├── pages/           # Dashboard, Projects, Tasks, TestResults
│       │   ├── components/      # UI 컴포넌트 (재사용)
│       │   ├── api/             # MCP 서버 통신 레이어
│       │   └── types/           # 프론트엔드 타입
│       └── package.json
│
├── data/
│   └── pm.db                    # SQLite 데이터 파일
│
├── CLAUDE.md                    # AI 에이전트 가이드
├── pnpm-workspace.yaml
└── package.json                 # 루트 패키지
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

새 프로젝트이므로 모두 새로 정의 필요:

- [ ] `CLAUDE.md` has coding conventions section → **생성 예정**
- [ ] `docs/01-plan/conventions.md` exists → **생성 예정**
- [ ] ESLint configuration → **Biome으로 대체**
- [ ] Prettier configuration → **Biome에 통합**
- [ ] TypeScript configuration (`tsconfig.json`) → **생성 예정**

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | missing | camelCase(변수), PascalCase(타입/컴포넌트), kebab-case(파일) | High |
| **Folder structure** | missing | 위 6.3 참조 | High |
| **Import order** | missing | 1) node 2) 외부 3) 내부 4) 타입 | Medium |
| **Error handling** | missing | Result 패턴 또는 try-catch + 커스텀 에러 | Medium |
| **DB 접근 패턴** | missing | Repository 패턴 (Service → Repository → SQLite) | High |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `GITHUB_TOKEN` | GitHub API 인증 | Server | ☑ |
| `GITHUB_REPO` | 연동할 GitHub 저장소 (owner/repo) | Server | ☑ |
| `DB_PATH` | SQLite 데이터베이스 파일 경로 | Server | ☑ |
| `MCP_PORT` | MCP 서버 포트 (기본: stdio) | Server | ☐ |
| `VITE_API_URL` | Web UI → API 엔드포인트 | Client | ☑ |

### 7.4 Pipeline Integration

| Phase | Status | Document Location | Command |
|-------|:------:|-------------------|---------|
| Phase 1 (Schema) | ☐ | `docs/01-plan/schema.md` | `/pdca design` 단계에서 정의 |
| Phase 2 (Convention) | ☐ | `docs/01-plan/conventions.md` | `/pdca design` 단계에서 정의 |

---

## 8. Open Decisions (미결 사항)

> Design 단계에서 결정 예정

| ID | 결정 사항 | 옵션 | 선호 | 결정 시점 |
|----|---------|------|------|---------|
| OD-01 | Web UI ↔ MCP 서버 통신 방식 | REST API / WebSocket | REST API (MVP) | Design |
| OD-02 | 다중 프로젝트 지원 | 단일 / 멀티 | 멀티 (DB 스키마는 이미 지원) | Design |
| OD-03 | AI 활동 로그 보존 정책 | 기간 제한 / 용량 제한 / 무제한 | 90일 보존 + 아카이브 | Design |
| OD-04 | GitHub 인증 방식 | Personal Access Token / GitHub App | PAT (MVP 단순성) | Design |
| OD-05 | Web UI 인증 | 없음(로컬) / 기본 인증 | 없음 (v1.0 로컬 전용) | Design |

---

## 9. Development Roadmap

| Phase | 기간 | 핵심 산출물 | 완료 기준 |
|-------|------|-----------|---------|
| **Phase 1** | 1주 | SQLite 스키마 + MCP 기본 도구 (CRUD) | AI가 태스크 CRUD 가능 |
| **Phase 2** | 1주 | 세션 컨텍스트 + 블로킹 분석 + 우선순위 엔진 | Claude Code 연동 완료 |
| **Phase 3** | 1주 | 테스트 도구 + 수정 루프 + 에스컬레이션 | AI 자율 테스트 & 수정 동작 |
| **Phase 4** | 1주 | GitHub API 연동 + PR/Issue 자동 연결 | PR 생성 시 태스크 자동 업데이트 |
| **Phase 5** | 1주 | React 대시보드 + 실시간 진행률 | 사람이 전체 현황 확인 |

---

## 10. Next Steps

1. [ ] Design 문서 작성 (`ai-pm-system.design.md`) - 상세 API 스펙, DB 스키마 DDL, 컴포넌트 설계
2. [ ] 미결 사항 (OD-01 ~ OD-05) 결정
3. [ ] CLAUDE.md 초안 작성
4. [ ] Phase 1 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-26 | Initial draft based on design specification | leechanhee |
