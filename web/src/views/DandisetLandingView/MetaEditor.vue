<template>
  <v-container>
    <v-row>
      <v-snackbar
        v-model="invalidPermissionSnackbar"
        top
        :timeout="2000"
        color="error"
      >
        Save Failed: Insufficient Permissions
        <v-btn
          icon
          @click="invalidPermissionSnackbar = false"
        >
          <v-icon color="white">
            mdi-close-circle
          </v-icon>
        </v-btn>
      </v-snackbar>

      <v-col>
        <v-card class="mb-2">
          <v-card-title>{{ data.name }}</v-card-title>
          <v-card-actions class="pt-0">
            <v-tooltip bottom>
              <template v-slot:activator="{ on }">
                <v-btn
                  icon
                  color="error"
                  v-on="on"
                  @click="closeEditor"
                >
                  <v-icon>
                    mdi-close-circle
                  </v-icon>
                </v-btn>
              </template>
              <span>Cancel</span>
            </v-tooltip>
            <v-tooltip bottom>
              <template v-slot:activator="{ on }">
                <v-btn
                  icon
                  color="primary"
                  v-on="on"
                  @click="save"
                >
                  <v-icon>
                    mdi-content-save
                  </v-icon>
                </v-btn>
              </template>
              <span>Save</span>
            </v-tooltip>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
    <v-row class="px-2">
      <v-col cols="6">
        <v-form ref="basic-form">
          <v-jsf
            v-model="basicModel"
            :schema="basicSchema"
          />
        </v-form>
      </v-col>
      <v-col cols="6">
        <v-dialog
          v-for="propKey in complexFields"
          :key="propKey"
        >
          <template v-slot:activator="{ on }">
            <v-btn
              outlined
              class="mx-2 my-2"
              v-on="on"
            >
              {{ schema.properties[propKey].title || propKey }}
            </v-btn>
          </template>
          <v-card class="pa-2 px-4">
            <v-form :ref="`${propKey}-form`">
              <v-jsf
                v-model="complexModel[propKey]"
                :schema="schema.properties[propKey]"
              />
            </v-form>
          </v-card>
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';
import { cloneDeep, pickBy } from 'lodash';

import { girderRest } from '@/rest';

import VJsf from '@koumoul/vjsf/lib/VJsf';
import '@koumoul/vjsf/lib/deps/third-party';
import '@koumoul/vjsf/lib/VJsf.css';

const ajv = new Ajv({ allErrors: true });
const basicTypes = ['number', 'integer', 'string', 'boolean', 'null'];
const isBasicType = (type) => basicTypes.includes(type);

export default {
  components: {
    VJsf,
  },
  props: {
    schema: {
      type: Object,
      required: true,
    },
    model: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      valid: false,
      yamlOutput: true,
      errors: [],
      data: this.copyValue(this.model),
      invalidPermissionSnackbar: false,
      basicModel: {},
      complexModel: {},
    };
  },
  computed: {
    basicSchema() {
      const schema = cloneDeep(this.schema);
      const newProperties = pickBy(schema.properties, (val) => (
        isBasicType(val.type) || (val.items && isBasicType(val.items.type))
      ));
      const newRequired = schema.required.filter((key) => Object.keys(newProperties).includes(key));

      schema.properties = newProperties;
      schema.required = newRequired;
      delete schema.description;

      return schema;
    },
    complexFields() {
      const basicFields = Object.keys(this.basicSchema.properties);
      const keys = Object.keys(this.schema.properties);
      return keys.filter((key) => !basicFields.includes(key));
    },
    validate() {
      return ajv.compile(this.schema);
    },
    contentType() {
      return this.yamlOutput ? 'text/yaml' : 'application/json';
    },
    output() {
      return this.yamlOutput ? jsYaml.dump(this.data) : JSON.stringify(this.data, null, 2);
    },
    ...mapState('dandiset', {
      id: (state) => (state.girderDandiset ? state.girderDandiset._id : null),
    }),
  },
  watch: {
    data: {
      handler(val) {
        this.validate(val);
        this.errors = this.validate.errors;
      },
      deep: true,
    },
  },
  created() {
    this.validate(this.data);
    this.errors = this.validate.errors;

    this.setModels();

    // TODO: Need to initialize all fields that are empty
  },
  methods: {
    setModels() {
      const basicFields = Object.keys(this.basicSchema.properties);
      const basicModel = cloneDeep(this.model);
      const complexModel = cloneDeep(this.model);

      Object.keys(this.model).forEach((key) => {
        if (!basicFields.includes(key)) {
          delete basicModel[key];
        } else {
          delete complexModel[key];
        }
      });

      this.basicModel = basicModel;
      this.complexModel = complexModel;
    },
    // tempFixSchema() {
    //   // const correctSchema = schema.properties.contributor.items.anyOf[0];
    //   // schema.properties.contributor.items = correctSchema;
    //   const newSchema = this.schema;
    //   // newSchema.properties.contributor.items = { ...newSchema.properties.contributor.items, ...newSchema.properties.contributor.items.anyOf[0] };
    //   newSchema.properties.contributor.items.anyOf.forEach((schema) => {
    //     schema.properties.schemaKey = {
    //       type: 'string',
    //       const: schema.title,
    //     };
    //   });

    //   // newSchema.properties.contributor.items.type = 'object';
    //   // newSchema.properties.contributor.items.title = 'Select Schema';
    //   // newSchema.properties.contributor.items.oneOf = newSchema.properties.contributor.items.anyOf;
    //   // delete newSchema.properties.contributor.items.anyOf;
    //   return newSchema;
    // },
    // tempFixModel() {
    //   const newModel = this.model;

    //   newModel.contributor.forEach((cont) => {
    //     cont.schemaKey = 'Person';
    //   });

    //   return newModel.contributor;
    // },
    closeEditor() {
      this.$emit('close');
    },
    async save() {
      try {
        const { status, data } = await girderRest.put(`folder/${this.id}/metadata`, { dandiset: this.data });
        if (status === 200) {
          this.setGirderDandiset(data);
          this.closeEditor();
        }
      } catch (error) {
        if (error.response.status === 403) {
          this.invalidPermissionSnackbar = true;
        }

        throw error;
      }
    },
    errorMessage(error) {
      const path = error.dataPath.substring(1);
      let message = `${path} ${error.message}`;

      if (error.keyword === 'const') {
        message += `: ${error.params.allowedValue}`;
      }

      return message;
    },
    copyValue(val) {
      if (val instanceof Object && !Array.isArray(val)) {
        return { ...val };
      }
      return val.valueOf();
    },
    download() {
      const blob = new Blob([this.output], { type: this.contentType });

      const extension = this.contentType.split('/')[1];
      const filename = `dandiset.${extension}`;
      const link = document.createElement('a');

      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
    ...mapMutations('dandiset', ['setGirderDandiset']),
  },
};
</script>
