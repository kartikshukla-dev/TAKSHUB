// Small helper so controllers can throw an error with an HTTP status attached.
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = ApiError;
