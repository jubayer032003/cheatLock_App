package com.jubayer.cheatlock.data

/** UI resolves the resource in its current language, rather than persisting translated errors. */
class BulkSelfExamRequestException(val messageResource: Int, fallbackMessage: String) : IllegalStateException(fallbackMessage)
