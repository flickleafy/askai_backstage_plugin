/*
 * Copyright (C) 2025-2026 flickleafy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Catalog collector for fetching entity data from Backstage
 * Implements data collection from the Backstage Catalog API
 * 
 * @packageDocumentation
 */

import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';
import { ICatalogCollector } from '../interfaces';
import type { Logger } from 'winston';
import type { DiscoveryApi } from '../router';

/**
 * Service for collecting entity data from Backstage catalog
 * Follows Single Responsibility and Dependency Inversion principles
 */
export class CatalogCollector implements ICatalogCollector {
  private readonly logger: Logger;
  private readonly catalogClient: CatalogClient;

  constructor(logger: Logger, discovery: DiscoveryApi) {
    this.logger = logger;
    this.catalogClient = new CatalogClient({ discoveryApi: discovery });
  }

  /**
   * Fetch all entities from the catalog
   */
  async fetchAllEntities(): Promise<Entity[]> {
    try {
      this.logger.info('Fetching all entities from catalog');
      
      const response = await this.catalogClient.getEntities();
      const entities = response.items;

      this.logger.info(`Fetched ${entities.length} entities from catalog`);
      return entities;
    } catch (error) {
      this.logger.error(`Failed to fetch entities: ${error}`);
      throw new Error(`Catalog fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch a specific entity by reference
   */
  async fetchEntity(entityRef: string): Promise<Entity> {
    try {
      this.logger.info(`Fetching entity: ${entityRef}`);
      
      const entity = await this.catalogClient.getEntityByRef(entityRef);
      
      if (!entity) {
        throw new Error(`Entity not found: ${entityRef}`);
      }

      return entity;
    } catch (error) {
      this.logger.error(`Failed to fetch entity ${entityRef}: ${error}`);
      throw new Error(`Entity fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract relevant text content from an entity
   */
  extractEntityContent(entity: Entity): string {
    const parts: string[] = [];

    // Add entity name and kind
    parts.push(`Entity: ${entity.metadata.name}`);
    parts.push(`Kind: ${entity.kind}`);

    // Add description if available
    if (entity.metadata.description) {
      parts.push(`Description: ${entity.metadata.description}`);
    }

    // Add tags if available
    if (entity.metadata.tags && entity.metadata.tags.length > 0) {
      parts.push(`Tags: ${entity.metadata.tags.join(', ')}`);
    }

    // Add annotations
    if (entity.metadata.annotations) {
      const annotations = Object.entries(entity.metadata.annotations)
        .filter(([key]) => !key.startsWith('backstage.io/'))
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      
      if (annotations) {
        parts.push(`Annotations: ${annotations}`);
      }
    }

    // Add spec information based on kind
    if (entity.kind === 'Component' && entity.spec) {
      const spec = entity.spec as any;
      
      if (spec.type) {
        parts.push(`Type: ${spec.type}`);
      }
      
      if (spec.lifecycle) {
        parts.push(`Lifecycle: ${spec.lifecycle}`);
      }
      
      if (spec.owner) {
        parts.push(`Owner: ${spec.owner}`);
      }
      
      if (spec.system) {
        parts.push(`System: ${spec.system}`);
      }
    }

    // Add API spec information
    if (entity.kind === 'API' && entity.spec) {
      const spec = entity.spec as any;
      
      if (spec.type) {
        parts.push(`API Type: ${spec.type}`);
      }
      
      if (spec.lifecycle) {
        parts.push(`Lifecycle: ${spec.lifecycle}`);
      }
      
      if (spec.owner) {
        parts.push(`Owner: ${spec.owner}`);
      }
      
      if (spec.definition) {
        parts.push(`Definition available: Yes`);
      }
    }

    // Add relations
    if (entity.relations && entity.relations.length > 0) {
      const relationsSummary = entity.relations
        .map(rel => `${rel.type}: ${rel.targetRef}`)
        .join(', ');
      parts.push(`Relations: ${relationsSummary}`);
    }

    return parts.join('\n');
  }

  /**
   * Get entity reference string
   */
  getEntityRef(entity: Entity): string {
    return `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;
  }
}
