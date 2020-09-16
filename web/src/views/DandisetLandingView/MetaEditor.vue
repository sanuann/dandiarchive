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

      <v-col sm="6">
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
        <v-form
          ref="form"
          v-model="valid"
        >
          <v-jsf
            v-model="model"
            :schema="tempFixSchema(schema)"
          />
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
import jsYaml from 'js-yaml';
import Ajv from 'ajv';

import { girderRest } from '@/rest';

import VJsf from '@koumoul/vjsf/lib/VJsf';
import '@koumoul/vjsf/lib/deps/third-party';
import '@koumoul/vjsf/lib/VJsf.css';

const ajv = new Ajv({ allErrors: true });

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
    };
  },
  computed: {
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
  },
  methods: {
    tempFixSchema(schema) {
      const correctSchema = schema.properties.contributor.items.anyOf[0];
      schema.properties.contributor.items = correctSchema;

      return schema;
    },
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
    publish() {
      // Call this.save()
      // Probably call publish endpoint on the backend
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
