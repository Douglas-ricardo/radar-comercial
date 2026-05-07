from fastapi import HTTPException


class PlanService:
    UPLOAD_LIMITS = {"free": 5, "pro": 50, "enterprise": 999999}
    USER_LIMITS = {"free": 1, "pro": 10, "enterprise": 999999}

    @staticmethod
    def get_upload_limit_for_plan(plan: str) -> int:
        return PlanService.UPLOAD_LIMITS.get(plan, PlanService.UPLOAD_LIMITS["free"])

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
