from fastapi import HTTPException


class PlanService:
    UPLOAD_LIMITS = {"free": 5, "pro": 50, "enterprise": 999999}
    USER_LIMITS = {"free": 1, "pro": 10, "enterprise": 999999}

    # Recursos enterprise exigem plano "enterprise". MFA/sessões ficam disponíveis
    # a todos os planos (segurança não deve ser gated); SSO/SCIM/CRM-sync sim.
    ENTERPRISE_FEATURES = {"sso", "scim", "crm_sync", "custom_rbac", "data_export", "ip_allowlist"}

    @staticmethod
    def get_upload_limit_for_plan(plan: str) -> int:
        return PlanService.UPLOAD_LIMITS.get(plan, PlanService.UPLOAD_LIMITS["free"])

    @staticmethod
    def has_feature(company, feature: str) -> bool:
        """True se o plano da empresa libera o recurso enterprise indicado."""
        if feature not in PlanService.ENTERPRISE_FEATURES:
            return True
        return getattr(company, "plan", "free") == "enterprise"

    @staticmethod
    def require_feature(company, feature: str) -> None:
        """Levanta 403 se o recurso enterprise não estiver disponível no plano."""
        if not PlanService.has_feature(company, feature):
            raise HTTPException(
                status_code=403,
                detail="Este recurso está disponível apenas no plano Enterprise. Fale com o time comercial.",
            )

    @staticmethod
    def check_upload_limit(company) -> None:
        if company.uploads_used >= company.uploads_limit:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Limite de {company.uploads_limit} uploads atingido para o plano "
                    f"{company.plan.capitalize()}. Faça upgrade para continuar a usar o Radar."
                ),
            )

    @staticmethod
    def check_user_limit(company, current_count: int) -> None:
        limit = PlanService.USER_LIMITS.get(company.plan, PlanService.USER_LIMITS["free"])
        if current_count >= limit:
            if company.plan == "free":
                raise HTTPException(
                    status_code=400,
                    detail="O plano Gratuito permite apenas 1 utilizador. Faça upgrade para convidar a sua equipa.",
                )
            raise HTTPException(
                status_code=400,
                detail=f"Limite de {limit} utilizadores atingido no plano {company.plan.capitalize()}.",
            )
