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
          <v-card-text class="pb-0">
            <template v-if="!errors || !errors.length">
              <v-alert
                dense
                type="success"
              >
                No errors
              </v-alert>
            </template>
            <template v-else>
              <v-alert
                v-for="error in errors"
                :key="error.schemaPath"
                dense
                type="error"
                text-color="white"
              >
                {{ errorMessage(error) }}
              </v-alert>
            </template>
          </v-card-text>
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
            <v-spacer />
            <v-tooltip bottom>
              <template v-slot:activator="{ on }">
                <v-btn
                  icon
                  v-on="on"
                  @click="download"
                >
                  <v-icon>
                    mdi-download
                  </v-icon>
                </v-btn>
              </template>
              <span>Download Metadata</span>
            </v-tooltip>
          </v-card-actions>
        </v-card>
        <v-form>
          <v-card class="pa-2">
            <meta-node
              v-model="data"
              class="pt-3"
              :schema="schema"
              :initial="data"
            />
          </v-card>
        </v-form>
      </v-col>
      <v-col sm="6">
        <v-card>
          <v-card-title>Dandiset Metadata</v-card-title>
          <v-divider />
          <v-card-actions class="py-0">
            <v-btn
              icon
              color="primary"
              class="mr-2"
              @click="download"
            >
              <v-icon>mdi-download</v-icon>
            </v-btn>
            <v-radio-group
              v-model="yamlOutput"
              row
            >
              <v-radio
                label="YAML"
                :value="true"
              />
              <v-radio
                label="JSON"
                :value="false"
              />
            </v-radio-group>
          </v-card-actions>
          <vue-json-pretty
            class="ma-2"
            :data="data"
            highlight-mouseover-node
          />
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script lang="ts">
import type { JSONSchema7 } from 'json-schema';

import {
  defineComponent, PropType, ref, computed, inject,
} from '@vue/composition-api';

import jsYaml from 'js-yaml';

import { girderRest } from '@/rest';
import { DandiModel, isJSONSchema } from '@/utils/schema/types';
import { EditorInterface } from '@/utils/schema/conversion';
import MetaNode from './MetaNode.vue';

function renderField(fieldSchema: JSONSchema7) {
  const { properties } = fieldSchema;

  if (fieldSchema.readOnly) { return false; }
  const allSubPropsReadOnly = properties !== undefined && Object.keys(properties).every(
    (key) => {
      const subProp = properties[key];
      return isJSONSchema(subProp) && subProp.readOnly;
    },
  );

  if (allSubPropsReadOnly) { return false; }
  return true;
}

const CommonVJSFOptions = {
  initialValidation: 'all',
};

export default defineComponent({
  name: 'Meditor',
  components: { VJsf },
  props: {
    schema: {
      type: Object as PropType<JSONSchema7>,
      required: true,
    },
    model: {
      type: Object as PropType<DandiModel>,
      required: true,
    },
  },
  setup(props, ctx) {
    // TODO: Replace once direct-vuex is added
    const store = inject('store') as any;

    const valid = ref(false);
    const { model: modelProp, schema: schemaProp } = props;
    const invalidPermissionSnackbar = ref(false);

    const editorInterface = new EditorInterface(schemaProp, modelProp);
    const {
      model,
      basicSchema,
      basicModel,
      basicModelValid,
      complexSchema,
      complexModel,
      complexModelValid,
      complexModelValidation,
    } = editorInterface;

    const closeEditor = () => { ctx.emit('close'); };

    function sectionButtonColor(propKey: string) {
      const sectionValid = complexModelValidation[propKey];
      if (sectionValid !== undefined && !sectionValid) {
        return 'error';
      }

      return undefined;
    }

    const id = computed(() => store.state.dandiset.girderDandiset?._id || null);
    function setGirderDandiset(payload: any) {
      // TODO: Replace once direct-vuex is added
      store.commit('dandiset/setGirderDandiset', payload);
    }

    async function save() {
      const dandiset = model;

      try {
        const { status, data } = await girderRest.put(`folder/${id}/metadata`, { dandiset });
        if (status === 200) {
          setGirderDandiset(data);
          closeEditor();
        }
      } catch (error) {
        if (error.response.status === 403) {
          invalidPermissionSnackbar.value = true;
        }

        throw error;
      }
    }

    // TODO: Add back UI to toggle YAML vs JSON
    const yamlOutput = ref(false);
    const contentType = computed(() => (yamlOutput.value ? 'text/yaml' : 'application/json'));
    const output = computed(
      () => (yamlOutput.value ? jsYaml.dump(model) : JSON.stringify(model, null, 2)),
    );

    function download() {
      const blob = new Blob([output.value], { type: contentType.value });

      const extension = contentType.value.split('/')[1];
      const filename = `dandiset.${extension}`;
      const link = document.createElement('a');

      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    }

    return {
      data: model,
      allModelsValid: valid,

      basicSchema,
      basicModel,
      basicModelValid,

      complexSchema,
      complexModel,
      complexModelValid,
      complexModelValidation,

      invalidPermissionSnackbar,
      renderField,
      closeEditor,
      save,
      download,
      sectionButtonColor,

      CommonVJSFOptions,
    };
  },
});
</script>
