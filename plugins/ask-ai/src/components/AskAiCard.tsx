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
 * Ask AI Card Component
 * Provides an interactive Q&A interface for entity pages
 * 
 * @packageDocumentation
 */

import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  TextField,
  Button,
  Typography,
  Box,
  CircularProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch,
} from '@material-ui/core';
import {
  ExpandMore as ExpandMoreIcon,
  Send as SendIcon,
  Source as SourceIcon,
} from '@material-ui/icons';
import { makeStyles } from '@material-ui/core/styles';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useAskQuestion } from '../hooks';
import { DocumentChunk } from '../api';

const useStyles = makeStyles(theme => ({
  card: {
    marginTop: theme.spacing(2),
  },
  questionField: {
    marginBottom: theme.spacing(2),
  },
  actionBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing(2),
  },
  submitButton: {
    marginLeft: theme.spacing(1),
  },
  errorText: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(2),
  },
  answerBox: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.shape.borderRadius,
  },
  answerText: {
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  },
  sourcesSection: {
    marginTop: theme.spacing(2),
  },
  sourceChunk: {
    marginTop: theme.spacing(1),
  },
  modelChip: {
    marginTop: theme.spacing(1),
  },
  loadingBox: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing(3),
  },
}));

/**
 * Ask AI Card component
 * Follows Single Responsibility Principle - only handles UI presentation
 */
export const AskAiCard: React.FC = () => {
  const classes = useStyles();
  const { entity } = useEntity();
  const { loading, error, response, askQuestion, reset } = useAskQuestion();

  const [question, setQuestion] = useState('');
  const [useRAG, setUseRAG] = useState(true);

  const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;
  const entityName = entity.metadata.name;

  const handleSubmit = async () => {
    if (!question.trim()) {
      return;
    }

    await askQuestion({
      prompt: question,
      entityId: useRAG ? entityRef : undefined,
      useRAG,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    reset();
    setQuestion('');
  };

  const renderSources = (sources: DocumentChunk[]) => {
    if (!sources || sources.length === 0) {
      return null;
    }

    return (
      <Box className={classes.sourcesSection}>
        <Typography variant="subtitle2" gutterBottom>
          <SourceIcon fontSize="small" style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Sources ({sources.length})
        </Typography>
        {sources.map((source, index) => (
          <Accordion key={source.id} className={classes.sourceChunk}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">
                {index + 1}. {source.entityName} ({source.metadata.source})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="textSecondary">
                {source.content}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    );
  };

  return (
    <Card className={classes.card}>
      <CardHeader
        title={`Ask AI about ${entityName}`}
        subheader="Ask questions about this service using AI with RAG"
      />
      <CardContent>
        <TextField
          className={classes.questionField}
          label="Your Question"
          placeholder="e.g., What APIs does this service expose?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          disabled={loading}
        />

        <Box className={classes.actionBox}>
          <FormControlLabel
            control={
              <Switch
                checked={useRAG}
                onChange={e => setUseRAG(e.target.checked)}
                color="primary"
                disabled={loading}
              />
            }
            label="Use RAG (Retrieval-Augmented Generation)"
          />
          <Box>
            {response && (
              <Button onClick={handleReset} disabled={loading}>
                Reset
              </Button>
            )}
            <Button
              className={classes.submitButton}
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={loading || !question.trim()}
              startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
            >
              {loading ? 'Asking...' : 'Ask AI'}
            </Button>
          </Box>
        </Box>

        {loading && (
          <Box className={classes.loadingBox}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Typography className={classes.errorText} variant="body2">
            Error: {error}
          </Typography>
        )}

        {response && !loading && (
          <>
            <Box className={classes.answerBox}>
              <Typography variant="subtitle2" gutterBottom>
                Answer:
              </Typography>
              <Typography variant="body1" className={classes.answerText}>
                {response.answer}
              </Typography>
              <Chip
                className={classes.modelChip}
                label={`Model: ${response.model}`}
                size="small"
                variant="outlined"
              />
            </Box>

            {renderSources(response.sources || [])}
          </>
        )}
      </CardContent>
    </Card>
  );
};
