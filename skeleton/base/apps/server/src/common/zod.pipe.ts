import { type ArgumentMetadata, Body, Injectable, Param, type PipeTransform, Query } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * A body, query string or route param the contract refused.
 *
 * Its own type rather than a `BadRequestException`, because the issues travel with it and
 * the filter is the one place that decides what a rejection looks like on the wire —
 * nothing between here and there has to know it is already an HTTP answer.
 */
export class ZodValidationError extends Error {
  constructor(
    message: string,
    readonly issues: unknown[]
  ) {
    super(message);
    this.name = "ZodValidationError";
  }
}

/**
 * The contract, applied to what arrived.
 *
 * A controller never parses a raw body itself: the schema is named in the signature, the
 * handler receives the parsed value already typed, and a bad request is a 400 in the
 * envelope with zod's own issues rather than a 500 from an uncaught `ZodError`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new ZodValidationError(`The request ${metadata.type} is not valid.`, parsed.error.issues);
  }
}

/** `@ZodBody(SetItemDoneRequest) body: SetItemDoneRequest` — parsed, or a 400. */
export const ZodBody = <T>(schema: ZodType<T>): ParameterDecorator => Body(new ZodValidationPipe(schema));

/** The same for the query string, which arrives as strings — coerce in the schema. */
export const ZodQuery = <T>(schema: ZodType<T>): ParameterDecorator => Query(new ZodValidationPipe(schema));

/** The same for the route params as one object: `@ZodParam(ItemParams) params: ItemParams`. */
export const ZodParam = <T>(schema: ZodType<T>): ParameterDecorator => Param(new ZodValidationPipe(schema));
