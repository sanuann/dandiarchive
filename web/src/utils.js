import RefParser from '@apidevtools/json-schema-ref-parser';
import { cloneDeep } from 'lodash';

const dandiUrl = 'https://dandiarchive.org';
const dandiAboutUrl = 'https://dandiarchive.org/about';
const dandiDocumentationUrl = 'https://www.dandiarchive.org/handbook/10_using_dandi/';

function getLocationFromRoute(route) {
  const { _modelType, _id } = route.query;
  if (_modelType && _id) {
    return { _modelType, _id };
  }
  return null;
}

function getPathFromLocation(location) {
  if (!location) {
    return '/';
  }
  return `/${location._modelType || location.type}${location._id ? `/${location._id}` : ''}`;
}

function getSelectedFromRoute(route) {
  const { ids } = route.params;
  return ids ? ids.split('/').map((item) => item.split('+')).map(([type, id]) => ({ _id: id, _modelType: type })) : [];
}

function getPathFromSelected(selected) {
  if (!selected.length) {
    return '';
  }
  return `/selected/${selected.map((model) => `${model._modelType}+${model._id}`).join('/')}`;
}

// https://stackoverflow.com/a/33928558/1643850 with slight modification
function copyToClipboard(text) {
  if (window.clipboardData && window.clipboardData.setData) {
    // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
    return window.clipboardData.setData('Text', text);
  } if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
    const textarea = document.createElement('textarea');
    textarea.textContent = text;
    textarea.style.position = 'fixed'; // Prevent scrolling to bottom of page in Microsoft Edge.
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand('copy'); // Security exception may be thrown by some browsers.
    } catch (e) {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
  return false;
}

function getDandisetContact(dandiset) {
  if (dandiset.meta.dandiset.contributors) {
    const contact = dandiset.meta.dandiset.contributors.find((cont) => cont.roles && cont.roles.includes('ContactPerson'));

    if (!contact) return null;
    return contact.name;
  }

  return null;
}

const draftVersion = 'draft';
const dandisetHasVersion = (versions, version) => {
  const versionNumbers = versions.map((v) => v.version);
  return versionNumbers.includes(version);
};

async function resolveSchemaReferences(schema) {
  // TEMPORARY: Remove known circular references

  /* eslint-disable no-param-reassign */
  delete schema.definitions.PropertyValue.properties.valueReference;
  delete schema.definitions.Activity.properties.isPartOf;
  delete schema.definitions.Activity.properties.hasPart;
  /* eslint-enable no-param-reassign */

  return RefParser.dereference(schema, { dereference: { circular: false } });
}

/**
 * Returns an adjusted schema with fields/values that are required for the display component.
 * @param {Object} originSchema - The schema to modify
*/
function adjustSchemaForEditor(originSchema) {
  const schema = cloneDeep(originSchema);

  // Recurse into each object property
  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      schema.properties[key] = adjustSchemaForEditor(schema.properties[key]);
    });
  }

  // Recurse into each array entry
  if (schema.items) {
    schema.items = adjustSchemaForEditor(schema.items);
  }

  // Handle singular allOf
  if (schema.allOf && schema.allOf.length === 1) {
    return adjustSchemaForEditor(schema.allOf[0]);
  }

  // Change anyOf to oneOf
  if (schema.anyOf) {
    schema.oneOf = schema.anyOf;
    delete schema.anyOf;
  }

  // Base Case
  if (schema.oneOf) {
    // Required for editor to function properly
    schema.type = schema.type || 'object';
    schema.oneOf = schema.oneOf.map((subschema, i) => {
      const newSubSchema = adjustSchemaForEditor(subschema);

      // If no title exists for the subschema, create one
      const arrayID = newSubSchema.title || `Schema ${i + 1}`;

      return {
        ...newSubSchema,
        properties: {
          ...newSubSchema.properties,
          schemaKey: {
            type: 'string',
            const: arrayID,
          },
        },
        title: arrayID,
      };
    });
  }

  // TEST TODO: REMOVE
  // if (schema.items && schema.items.oneOf) {
  //   schema.items = schema.items.oneOf[0];
  //   // delete schema.items;
  // }

  // TEST TODO: REMOVE
  // if (schema.oneOf) {
  //   return schema.oneOf[0];
  // }

  return schema;
}

/**
 * Returns an adjusted model with fields/values that are required for the display component.
 * @param {Object} originModel - The model to modify.
 * @param {Object} schema - The schema to which the model belongs.
 */
function adjustModelForEditor(originModel, schema) {
  // TEMP
  return originModel;
}

export {
  dandiUrl,
  dandiAboutUrl,
  dandiDocumentationUrl,
  getLocationFromRoute,
  getPathFromLocation,
  getSelectedFromRoute,
  getPathFromSelected,
  copyToClipboard,
  getDandisetContact,
  draftVersion,
  dandisetHasVersion,
  resolveSchemaReferences,
  adjustSchemaForEditor,
  adjustModelForEditor,
};
