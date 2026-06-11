class AIPPError(Exception):
    """Base class for AIPP exceptions."""
    pass

class InsufficientBalanceError(AIPPError):
    """Raised when the client has insufficient balance for a charge."""
    pass

class RateLimitError(AIPPError):
    """Raised when the API rate limit is exceeded."""
    pass

class InvalidAPIKeyError(AIPPError):
    """Raised when the provided API key is invalid."""
    pass
