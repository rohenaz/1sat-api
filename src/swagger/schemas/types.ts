import type { ElysiaSwaggerConfig } from "@elysiajs/swagger";

type SwaggerDocumentation = NonNullable<ElysiaSwaggerConfig["documentation"]>;
type SwaggerComponents = NonNullable<SwaggerDocumentation["components"]>;
type SwaggerSchemas = NonNullable<SwaggerComponents["schemas"]>;

export type SwaggerSchema = SwaggerSchemas[string];
