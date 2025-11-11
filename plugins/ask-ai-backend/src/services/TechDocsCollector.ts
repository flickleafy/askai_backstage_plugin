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
 * TechDocs collector for fetching documentation
 * Implements data collection from Backstage TechDocs
 * 
 * @packageDocumentation
 */

import { ITechDocsCollector } from '../interfaces';
import type { Logger } from 'winston';
import type { DiscoveryApi } from '../router';
import fetch from 'node-fetch';

/**
 * Service for collecting documentation from TechDocs
 * Follows Single Responsibility Principle
 * 
 * Note: This implementation assumes TechDocs is available and configured
 */
export class TechDocsCollector implements ITechDocsCollector {
  private readonly logger: Logger;
  private readonly discovery: DiscoveryApi;

  constructor(logger: Logger, discovery: DiscoveryApi) {
    this.logger = logger;
    this.discovery = discovery;
  }

  /**
   * Fetch documentation for an entity
   */
  async fetchDocumentation(entityRef: string): Promise<string | null> {
    try {
      this.logger.info(`Fetching documentation for: ${entityRef}`);
      
      // Parse entity reference
      const [kind, namespaceAndName] = entityRef.split(':');
      const [namespace, name] = namespaceAndName ? namespaceAndName.split('/') : ['default', kind];

      // Get TechDocs base URL
      const baseUrl = await this.discovery.getBaseUrl('techdocs');
      
      // Fetch the index.html or main documentation page
      const docUrl = `${baseUrl}/static/docs/${namespace}/${kind.toLowerCase()}/${name}/index.html`;
      
      const response = await fetch(docUrl);
      
      if (!response.ok) {
        if (response.status === 404) {
          this.logger.info(`No documentation found for ${entityRef}`);
          return null;
        }
        throw new Error(`Failed to fetch documentation: ${response.status}`);
      }

      const html = await response.text();
      
      // Extract text content from HTML
      const textContent = this.extractTextFromHtml(html);
      
      this.logger.info(`Successfully fetched documentation for ${entityRef}`);
      return textContent;
    } catch (error) {
      this.logger.warn(`Failed to fetch documentation for ${entityRef}: ${error}`);
      return null;
    }
  }

  /**
   * Check if documentation exists for an entity
   */
  async hasDocumentation(entityRef: string): Promise<boolean> {
    try {
      const doc = await this.fetchDocumentation(entityRef);
      return doc !== null && doc.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract text content from HTML
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.trim();
    
    return text;
  }

  /**
   * Fetch multiple documentation pages for an entity
   * Useful for entities with multiple documentation pages
   */
  async fetchAllDocumentationPages(entityRef: string): Promise<string[]> {
    const docs: string[] = [];
    
    // Try to fetch main documentation
    const mainDoc = await this.fetchDocumentation(entityRef);
    if (mainDoc) {
      docs.push(mainDoc);
    }
    
    // Additional pages could be discovered by parsing the navigation
    // For this PoC, we'll just return the main page
    
    return docs;
  }
}
