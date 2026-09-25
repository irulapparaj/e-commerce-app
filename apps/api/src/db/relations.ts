import { Prisma } from '@prisma/client';

export interface RelationRef {
  readonly model: string;
  readonly isList: boolean;
}

/** Relation name → target model for every model, derived from the generated DMMF. */
export const RELATIONS: Readonly<Record<string, Readonly<Record<string, RelationRef>>>> =
  Object.fromEntries(
    Prisma.dmmf.datamodel.models.map((model) => [
      model.name,
      Object.fromEntries(
        model.fields
          .filter((field) => field.kind === 'object')
          .map((field) => [field.name, { model: field.type, isList: field.isList }]),
      ),
    ]),
  );
