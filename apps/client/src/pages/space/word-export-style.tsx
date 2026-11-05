import { Text } from "@mantine/core";
import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { WordExportStylePage } from "@/features/space/components/word-export-style-page";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";

export default function WordExportStyleRoute() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: space, refetch } = useGetSpaceBySlugQuery(spaceSlug);
  const permissions = space?.membership?.permissions;
  const retried = useRef(false);
  useEffect(() => {
    if (space && !permissions && !retried.current) {
      retried.current = true;
      void refetch();
    }
  }, [space, permissions, refetch]);
  const spaceAbility = useSpaceAbility(permissions);

  if (!space || !permissions) return <></>;

  const allowed = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Settings,
  );

  return (
    <>
      <DocumentTitle title={t("Word export style")} />
      {allowed ? (
        <WordExportStylePage key={space.id} space={space} />
      ) : (
        <Text p="xl">{t("Only space admins can change the Word export style.")}</Text>
      )}
    </>
  );
}
