'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button, type ButtonVariant, IconButton } from '@/components/ui/Button';
import { Checkbox, Radio } from '@/components/ui/Choice';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Price } from '@/components/ui/Price';
import { QuantityStepper } from '@/components/ui/QuantityStepper';

import { GallerySection, Specimen } from './GallerySection';

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'link'];
const FORCED_STATES = ['default', 'hover', 'focus'] as const;

export function GalleryButtons() {
  return (
    <GallerySection id="buttons" title="Button">
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          {FORCED_STATES.map((state) => (
            <Specimen key={state} label={`${variant} · ${state}`}>
              <Button variant={variant} data-state={state === 'default' ? undefined : state}>
                Add to cart
              </Button>
            </Specimen>
          ))}
          <Specimen label={`${variant} · disabled`}>
            <Button variant={variant} disabled>
              Add to cart
            </Button>
          </Specimen>
          <Specimen label={`${variant} · loading`}>
            <Button variant={variant} loading>
              Add to cart
            </Button>
          </Specimen>
          <Specimen label={`${variant} · icon`}>
            <Button variant={variant} icon="arrow" iconPosition="end">
              Continue
            </Button>
          </Specimen>
          <Specimen label={`${variant} · small`}>
            <Button variant={variant} size="sm">
              Apply
            </Button>
          </Specimen>
        </div>
      ))}
      <Specimen label="icon button">
        <IconButton icon="heart" label="Save to wishlist" />
      </Specimen>
      <Specimen label="icon button · active">
        <IconButton icon="bag" label="Cart" active />
      </Specimen>
      <Specimen label="icon button · disabled">
        <IconButton icon="search" label="Search" disabled />
      </Specimen>
    </GallerySection>
  );
}

export function GalleryFields() {
  return (
    <GallerySection id="fields" title="Field · Input · Textarea · Select · Checkbox · Radio">
      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
        <Field label="Email address" help="We only use it for order updates.">
          <Input type="email" placeholder="you@example.com" />
        </Field>
        <Field label="Pincode" error="Enter a six-digit pincode." required>
          <Input inputMode="numeric" defaultValue="60000" />
        </Field>
        <Field label="Disabled">
          <Input defaultValue="Not editable" disabled />
        </Field>
        <Field label="Focused" help="Forced focus ring">
          <Input defaultValue="Chennai" data-state="focus" />
        </Field>
        <Field label="Notes">
          <Textarea placeholder="Anything we should know?" />
        </Field>
        <Field label="Sort by">
          <Select defaultValue="popular">
            <option value="popular">Most popular</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <Checkbox
          label="Email me about new arrivals"
          description="Once a month, no more."
          defaultChecked
        />
        <Checkbox label="Unchecked" />
        <Checkbox label="Disabled" disabled />
        <Radio name="delivery" label="Standard delivery" defaultChecked />
        <Radio name="delivery" label="Express delivery" description="Chennai only" />
      </div>
    </GallerySection>
  );
}

export function GalleryCommerce() {
  const [quantity, setQuantity] = useState(2);
  return (
    <GallerySection id="commerce" title="Badge · Price · QuantityStepper">
      <Specimen label="badges">
        <div className="flex gap-4">
          <Badge>New</Badge>
          <Badge tone="muted">Sale</Badge>
          <Badge tone="success">In stock</Badge>
          <Badge tone="critical">Sold out</Badge>
        </div>
      </Specimen>
      <Specimen label="price">
        <Price amount={8000} />
      </Specimen>
      <Specimen label="price · sale">
        <Price amount={64900} compareAt={79900} />
      </Specimen>
      <Specimen label="price · large">
        <Price amount={12345678} size="lg" />
      </Specimen>
      <Specimen label="price · small">
        <Price amount={4999} compareAt={5999} size="sm" />
      </Specimen>
      <Specimen label="stepper">
        <QuantityStepper value={quantity} onChange={setQuantity} />
      </Specimen>
      <Specimen label="stepper · at min">
        <QuantityStepper value={1} onChange={() => undefined} />
      </Specimen>
      <Specimen label="stepper · at max">
        <QuantityStepper value={20} onChange={() => undefined} />
      </Specimen>
      <Specimen label="stepper · disabled">
        <QuantityStepper value={3} onChange={() => undefined} disabled />
      </Specimen>
    </GallerySection>
  );
}
