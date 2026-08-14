namespace PlcTelegramSimulator.Domain;

/// <summary>
/// Raised by domain factories when external input fails validation. Carries a
/// per-field map of validation messages so the Web layer can surface it as an
/// RFC 7807 <c>ProblemDetails</c> / validation problem response.
/// </summary>
public sealed class DomainValidationException : Exception
{
    /// <summary>Field name → human-readable validation message.</summary>
    public IReadOnlyDictionary<string, string> Errors { get; }

    public DomainValidationException(IReadOnlyDictionary<string, string> errors)
        : base("One or more validation errors occurred.")
    {
        Errors = errors;
    }
}
