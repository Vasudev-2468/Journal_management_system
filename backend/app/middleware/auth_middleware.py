from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from your_project_name.services.auth_service import AuthService

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # TODO: Implement authentication logic
        token = request.headers.get("Authorization")
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")

        user = AuthService.verify_token(token)
        if not user:
            raise HTTPException(status_code=403, detail="Invalid token")

        request.state.user = user  # Attach user to request state
        response = await call_next(request)
        return response

# Note: Replace 'your_project_name' with the actual name of your project.