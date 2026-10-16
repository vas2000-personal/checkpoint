// One error shape for the whole server. A status means fail() may show the message as the author
// wrote it; no status means fail() answers with generic text and logs a redacted server-side error.
export class AppError extends Error{
 constructor(message,status,extra){super(message);this.name='AppError';if(status!==undefined)this.status=status;if(extra)Object.assign(this,extra)}
}
export const bad=(message,status=400,extra)=>new AppError(message,status,extra);
